import PropTypes from "prop-types";
import { bearingDegrees, distanceMiles } from "../lib/geo";
import hardware from "../hardware";
import { canonicalHostname } from "../lib/meshData";

const present = (v) => v !== null && v !== undefined && v !== "" && !isNaN(v);

const neighborInfo = (n, m, hn) => {
  if (!(n.lat && n.lon && hn.lat && hn.lon) || ![n.latNum, n.lonNum, hn.latNum, hn.lonNum].every(Number.isFinite)) return "";
  if (m.linkType !== "RF" && m.linkType !== "XLINK") return "";
  const from = [n.lonNum, n.latNum];
  const to = [hn.lonNum, hn.latNum];
  const brg = (360 + Math.round(bearingDegrees(from, to))) % 360;
  const dist = distanceMiles(from, to).toFixed(1);
  if (!(parseFloat(dist) > 0)) return "";
  if (m.linkType === "XLINK") return `${brg}° ${dist} miles`;
  let sigf = m.signal - m.noise;
  if (isNaN(sigf)) sigf = "-";
  const hl = hn.link_info.find((info) => canonicalHostname(info.hostname) === n.name);
  let sigt = hl ? hl.signal - hl.noise : "-";
  if (isNaN(sigt)) sigt = "-";
  return `${sigf} dB ← ${brg}° ${dist} miles → ${sigt} dB`;
};

export default function NodePopup({ node: n, byName, active, openNode }) {
  const rf = n.meshrf;
  const open = (name) => (e) => {
    e.preventDefault();
    openNode(name);
  };
  return (
    <div className="node-popup">
      <h6>{active === false ? <a>{n.node}</a> : <a href={`http://${n.node}.local.mesh`} target="_blank" rel="noreferrer">{n.node}</a>}</h6>
      <table>
        <tbody>
          {n.node_details && n.node_details.description && (
            <tr style={{ verticalAlign: "top" }}><td>Description</td><td>{n.node_details.description.replace("&deg;", "°")}</td></tr>
          )}
          <tr><td>Location</td><td>{n.lat},{n.lon}</td></tr>
          {rf && rf.antenna && rf.antenna.description && (
            <tr style={{ verticalAlign: "top" }}><td>Antenna</td><td>{rf.antenna.description.replace("&deg;", "°")}</td></tr>
          )}
          {rf && present(rf.height) && <tr><td>Height</td><td>{rf.height} m</td></tr>}
          {rf && present(rf.azimuth) && <tr><td>Azimuth</td><td>{rf.azimuth}&deg;</td></tr>}
          {rf && present(rf.elevation) && <tr><td>Elevation</td><td>{rf.elevation}&deg;</td></tr>}
          {rf && <tr><td>RF Status</td><td style={{ textTransform: "capitalize" }}>{rf.status}</td></tr>}
          {rf && rf.status === "on" && (
            <>
              <tr><td>SSID</td><td>{rf.ssid}</td></tr>
              <tr style={{ verticalAlign: "top" }}><td>Channel</td><td>{rf.channel}</td></tr>
              <tr><td>Frequency</td><td>{rf.freq}</td></tr>
              <tr><td>Bandwidth</td><td>{rf.chanbw} MHz</td></tr>
              <tr><td>LQM</td><td>{n.lqm && n.lqm.enabled ? "Enabled" : n.lqm ? "Disabled" : "Unavailable"}</td></tr>
              <tr><td>MAC</td><td>{n.interfaces && n.interfaces[0] && n.interfaces[0].mac ? n.interfaces[0].mac : "N/A"}</td></tr>
            </>
          )}
          {n.node_details && <tr style={{ verticalAlign: "top" }}><td>Hardware</td><td>{hardware(n.node_details.board_id) || n.node_details.model}</td></tr>}
          {n.node_details && <tr><td width="80">Firmware</td><td>{n.node_details.firmware_version}</td></tr>}
          <tr style={{ verticalAlign: "top", whiteSpace: "nowrap" }}>
            <td>Neighbors</td>
            <td>
              {n.link_info.map((m, i) => {
                const chostname = canonicalHostname(m.hostname);
                const hn = byName[chostname];
                if (hn && m.linkType) {
                  return (
                    <div key={`${m.hostname}-${i}`}>
                      <div><a href="#" onClick={open(chostname)}>{chostname}</a> <span className="linktype">{m.linkType}</span></div>
                      <div className="bearing">{neighborInfo(n, m, hn)}</div>
                    </div>
                  );
                }
                return <div key={`${m.hostname}-${i}`}>{chostname} <span className="linktype">{m.linkType ? `${m.linkType}` : ""}</span></div>;
              })}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

NodePopup.propTypes = {
  node: PropTypes.object.isRequired,
  byName: PropTypes.object.isRequired,
  active: PropTypes.bool,
  openNode: PropTypes.func.isRequired,
};
