import PropTypes from "prop-types";
import { METRICS, METRIC_KEYS, metricValue } from "../lib/meshData";

const show = (v) => {
  if (v === undefined || v === null || v === "" || (typeof v === "number" && isNaN(v))) return "-";
  if (typeof v === "number") return Math.round(v * 100) / 100;
  return v;
};

export default function LinkPopup({ conn, openNode }) {
  const open = (name) => (e) => {
    e.preventDefault();
    openNode(name);
  };
  return (
    <div className="link-popup">
      <div className="link-popup-title">
        <a href="#" onClick={open(conn.from)}>{conn.from}</a>
        <span style={{ margin: "0 5px" }}>&harr;</span>
        <a href="#" onClick={open(conn.to)}>{conn.to}</a>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Metric</th>
            <th>Fwd</th>
            <th>Rev</th>
          </tr>
        </thead>
        <tbody>
          {METRIC_KEYS.map((k) => {
            const m = METRICS[k];
            const fwd = show(metricValue(conn, k, false));
            const rev = show(metricValue(conn, k, true));
            return (
              <tr key={k}>
                <td>{m.label}</td>
                <td>{fwd} {fwd !== "-" ? m.unit : ""}</td>
                <td>{rev} {rev !== "-" ? m.unit : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

LinkPopup.propTypes = {
  conn: PropTypes.object.isRequired,
  openNode: PropTypes.func.isRequired,
};
