# Mesh Map 
Mesh Map is a web based application useful to view who are connected to the mesh and what is his node position in map,
it also shows additional information for each node.

# Requirements
The application requires at least a simple web server capable of host HTML doxcuments. For a live view the viewer must have access to the local mesh.

# How to install 
You can host this application on your prefered Web Server.

Please follow this general steps to install:
1. Clone the repository.
2. Install the supporting libraries using 'npm install'.
3. Build the application using 'npm run build'.
4. Copy the applications (which is now a simple group of static files) from the 'build' directory to your web server.

# Configuration
The application is configured by modifying the 'appConfig.json' file. The default configuraiton is for the Bay Area mesh.
To change the configuration:

1. Open 'public/appConfig.json'.
2. Edit the settings. The defaults look something like this:
```
{     
    "name" : "BayArea Mesh",
    "mapSettings": {
        "zoom": "10",
        "mapCenter": {
            "node": "kn6plv-brkoxfla-arecibo",
            "lat": "37.8880",
            "lon": "-122.2679"
        },
        "servers": [
            { "test": "http://kn6plv-tiles.local.mesh/tile/10/164/395.png", "url": "http://kn6plv-tiles.local.mesh/tile/{z}/{x}/{y}.png" },
            { "test": "https://c.tile.openstreetmap.org/10/162/395.png", "url": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" }
        ]
    },
    "contactInfo": {
        "callsign" : "KN6PLV",
        "name": "Tim Wilkinson",
        "email": "tim.j.wilkinson@gmail.com"
    },
    "nodesFilter" : "[a-zA-z]+[0-9][a-zA-Z]+",
    "offline" : false
}
```

## Basemap and data settings
The map draws the mesh with MapLibre over a vector basemap. These optional settings choose the basemap and the data file:

- `mapSettings.basemaps`: the basemap archives to try, in order. Each entry is either a base URL that serves `status/latest.json` and the archive parts it names (the layout of `https://tiles.squallar.app`), or a direct `.pmtiles` URL. The first one that answers is used. A base that has not answered within `mapSettings.basemapTimeoutMs` (default 3000) gives way to a later one that has. Default: `["https://tiles.squallar.app"]`.
- `mapSettings.servers`: the older raster tile servers. They are used only when no basemap archive answers.
- `dataUrl`: the mesh data file, relative to the page. Default: `data/out.json`.
- `dataCacheBuster`: set to `false` to stop adding `?t=<time>` to the data URL, for servers that send their own caching headers. Default: `true`.

Example for a mesh server:
```
"mapSettings": {
    "zoom": "10",
    "mapCenter": { "node": "KP4DJT-HAP", "lat": "35.4704", "lon": "-97.5147" },
    "basemaps": ["http://KI5VMF-KUBERNETES.local.mesh/tiles", "https://tiles.squallar.app"]
},
"dataUrl": "data/out.json",
"dataCacheBuster": false
```

The `zoom` in `mapSettings` is a Leaflet zoom, as before. The page URL can also give a position, as AREDN's world map does: `#<zoom>/<lat>/<lon>` (MapLibre zoom), `#<lat>/<lon>`, or `?lat=&lon=&zoom=`. Without a zoom the map opens at zoom 12. When the page is small (the map tile on a node status page), it shows only the nodes and links.

The map follows the system light or dark setting. The Theme button in the link panel switches between System, Light and Dark.

# About Developer 
Mesh Map was originally developed by KP4MSR but has been extensively rewritten by KN6PLV (tim.j.wilkinson@gmail.com)
