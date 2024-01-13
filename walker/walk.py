import datetime
import json
from json.decoder import JSONDecodeError
import os

import aiohttp
import asyncio
from aiohttp_retry import RetryClient, RandomRetry
from aiohttp.client_exceptions import ClientConnectionError, ClientConnectorError, ServerDisconnectedError, ClientResponseError, ClientPayloadError
from aiohttp.http_exceptions import BadHttpMessage


_ignored_exceptions = (ConnectionRefusedError, ClientConnectorError, ClientConnectionError, ClientPayloadError, ClientResponseError, BadHttpMessage, JSONDecodeError, asyncio.TimeoutError, ServerDisconnectedError, UnicodeDecodeError)

class AsyncWalk:
    def __init__(self, starting_node, max_concurrency=200, attempts=5, timeout_seconds=120):
        self._client = RetryClient(
            client_session=aiohttp.ClientSession(
                connector=aiohttp.TCPConnector(limit=max_concurrency, force_close=True),
                timeout=aiohttp.ClientTimeout(total=timeout_seconds),
                headers={"User-Agent": "KI5VMF-MeshMap Walker (https://meshmap.aredn.mcswain.dev/)"},
            ),
            retry_options=RandomRetry(
                attempts=attempts,
                min_timeout=timeout_seconds,
                max_timeout=timeout_seconds+10,
                exceptions=_ignored_exceptions,
                statuses=[i for i in range(205,300)] + [i for i in range(300,399)] + [i for i in range(405,600)],
            ),
        )
        self._starting_node = starting_node
        self._tasks = []
        self._data = []

    async def _fetch(self, url):
        async with self._client.get(url) as response:
            return await response.json(content_type=None)

    async def run(self):
        total_tasks = 1
        completed = 1
        _non_mapped = 0
        all_seen = set()
        try:
            resp = await self._fetch(f"http://{self._starting_node}.local.mesh:8080/cgi-bin/sysinfo.json?hosts=1&link_info=1&lqm=1")
        except _ignored_exceptions as _:
            pass
        for host in resp["hosts"]:
            url = f"http://{host['name']}.local.mesh:8080/cgi-bin/sysinfo.json?hosts=1&link_info=1&lqm=1"
            all_seen.add(host['name'])
            self._tasks.append(asyncio.ensure_future(self._fetch(url)))
            total_tasks += 1

        all_seen.add(self._starting_node)

        while len(self._tasks) > 0:
            new_tasks = []
            done, tasks = await asyncio.wait(self._tasks, return_when=asyncio.FIRST_COMPLETED)
            for f in done:
                completed += 1
                print(f"\33[2K\rCompleted {completed} tasks out of {total_tasks}, {total_tasks-completed} left. Found {len(all_seen)} hosts, {len(self._data)} AREDN nodes.", end="")
                try:
                    response = await f
                    if response and "node" in response and response["node"]:
                        for host in (response["hosts"] if "hosts" in response else []):
                            if host['name'] not in all_seen:
                                all_seen.add(host['name'])
                                url = f"http://{host['name']}.local.mesh:8080/cgi-bin/sysinfo.json?hosts=1&link_info=1&lqm=1"
                                new_tasks.append(asyncio.ensure_future(self._fetch(url)))
                                total_tasks += 1

                        if "lat" in response and "lon" in response and response["lat"] and response["lon"]:
                            if "link_info" not in response or not response["link_info"]:
                                response["link_info"] = {}

                            if "node_details" in response and "mesh_supernode" in response["node_details"] and response["node_details"]["mesh_supernode"]:
                                for key in response["link_info"]:
                                    if response["link_info"][key]["linkType"] == "TUN":
                                        response["link_info"][key]["linkType"] = "STUN"

                            self._data.append({
                                "data": {
                                    "node": response["node"] if "node" in response else None,
                                    "lastseen": response["lastseen"] if "lastseen" in response else None,
                                    "lat": response["lat"] if "lat" in response else None,
                                    "lon": response["lon"] if "lon" in response else None,
                                    "meshrf": response["meshrf"] if "meshrf" in response else {},
                                    "chanbw": response["chanbw"] if "chanbw" in response else None,
                                    "node_details": response["node_details"] if "node_details" in response else {},
                                    "interfaces": response["interfaces"] if "interfaces" in response else None,
                                    "link_info": [response["link_info"][key] for key in response["link_info"]] if "link_info" in response else None,
                                    "lqm": response["lqm"] if "lqm" in response else None,
                                },
                            })
                        elif "node" in response and response["node"]:
                            _non_mapped += 1
                except _ignored_exceptions as _:
                    continue
            self._tasks = list(tasks) + new_tasks

        print()
        return (self._data, _non_mapped, total_tasks)

    async def stop(self):
        await self._client.close()

async def main():
    walk = AsyncWalk(starting_node="KI5VMF-oklahoma-supernode")
    node_info, non_mapped, total_scraped = await walk.run()
    await walk.stop()
    print(f"Found {len(node_info)} nodes.")
    with open("/usr/share/nginx/html/data/out.json.new", "w") as f:
        json.dump({
            "nodeInfo": node_info,
            "nonMapped": non_mapped,
            "hostsScraped": total_scraped,
            "date": datetime.datetime.utcnow().isoformat(),
        }, f)
    os.rename("/usr/share/nginx/html/data/out.json.new", "/usr/share/nginx/html/data/out.json")

asyncio.run(main())
