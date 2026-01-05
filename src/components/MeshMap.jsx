// @flow

import React, { Component } from "react";
import PropTypes from "prop-types";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import { DivIcon } from "leaflet";
import hardware from "../hardware";
import * as Turf from '@turf/turf';
import AzimuthPointer from "./AzimuthPointer";
import { freqStartsWith } from "../utils/freq";
import meshIconUrl from "../img/mesh_icon.svg";

const createMeshIcon = (colorClass) => {
  return new DivIcon({
    className: `mesh-icon mesh-icon-${colorClass}`,
    html: `<img src="${meshIconUrl}" class="mesh-icon-img" />`,
    iconSize: [25, 25],
  });
}

const PurpleIcon = createMeshIcon('purple');
const OrangeIcon = createMeshIcon('gold');
const BlueIcon = createMeshIcon('blue');
const MagentaIcon = createMeshIcon('magenta');
const HalowIcon = createMeshIcon('teal');
const GrayIcon = createMeshIcon('gray');
const GreenIcon = createMeshIcon('green');

const METRICS = {
  default: { label: 'None', unit: '' },
  lq: { label: 'Link Quality', unit: '%', min: 0, max: 100, reverse: false, prop: 'quality' },
  ping: { label: 'Ping Time', unit: 'ms', min: 0, max: 1000, reverse: true, prop: 'ping_success_time', factor: 1000 },
  ping_quality: { label: 'Ping Quality', unit: '%', min: 0, max: 100, reverse: false, prop: 'ping_quality' },
  routes: { label: 'Route Count', unit: '', min: 0, max: 100, reverse: false, prop: 'babel_route_count' },
  metric: { label: 'Babel Metric', unit: '', min: 0, max: 4096, reverse: true, prop: 'babel_metric' },
  snr: { label: 'SNR', unit: 'dB', min: 0, max: 50, reverse: false, prop: 'snr' },
  bitrate: { label: 'Bitrate', unit: 'Mbps', min: 0, max: 100, reverse: false, prop: 'bitrate' },
};

const getColor = (value, min, max, reverse) => {
  if (value === undefined || value === null || isNaN(value)) return null;
  let normalized = (value - min) / (max - min);
  if (normalized < 0) normalized = 0;
  if (normalized > 1) normalized = 1;
  if (reverse) normalized = 1 - normalized;
  
  let r, g, b;
  if (normalized < 0.5) {
    // Red (255, 0, 0) to Yellow (255, 255, 0)
    const f = normalized * 2;
    r = 255;
    g = Math.round(255 * f);
    b = 0;
  } else {
    // Yellow (255, 255, 0) to Green (0, 128, 0)
    const f = (normalized - 0.5) * 2;
    r = Math.round(255 * (1 - f));
    g = Math.round(255 - (127 * f));
    b = 0;
  }
  return `rgb(${r}, ${g}, ${b})`;
};

// Function to get the Freq Icon
function getIcon(n){
  if (n.node_details.mesh_supernode) {
    return GreenIcon;
  }
  const rf = n.meshrf;
  const chan = parseInt(rf.channel);
  if (chan >= 3380 && chan <= 3495) {
    return BlueIcon;
  }
  const freq = rf.freq;
  if (freq) {
    if (freqStartsWith(freq, "2")) {
      return PurpleIcon;
    } else if (freqStartsWith(freq, "5")) {
      return OrangeIcon;
    } else if (freqStartsWith(freq, "3")) {
      return BlueIcon;
    } else if (freqStartsWith(freq, "9")) {
      // check rf.chanbw == 1, 2, 4, or 8 MHz for halow, otherwise magenta. rf.chanbw can be string or number
      const chanbw = typeof rf.chanbw === "number" ? rf.chanbw : parseInt(rf.chanbw);
      if (chanbw === 1 || chanbw === 2 || chanbw === 4 || chanbw === 8) {
        return HalowIcon;
      }
      return MagentaIcon;
    }
  }
  return GrayIcon;
}

export default class MeshMap extends Component {
  static propTypes = {
    appConfig: PropTypes.object,
    selected: PropTypes.string,
    nodesData: PropTypes.array,
  };

  constructor(props) {
    super(props);
    this.mapRef = React.createRef();
    this.markers = {};

  }

  setMarkerRef = (element, node) => {
    this.markers[node] = element;
  };

  state = {
    tile_url: null,
    metric: 'default',
    direction: 'forward',
    graphData: {
      rfconns: [],
      tunconns: [],
      stunconns: [],
      dtdconns: [],
      rfdtdconns: [],
      validnodes: {}
    }
  }

  componentDidMount() {
    this.processGraphData();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.nodesData !== this.props.nodesData || prevProps.selected !== this.props.selected) {
      this.processGraphData();
    }
  }

  processGraphData() {
    if (!this.props.nodesData) return;

    const rfconns = [];
    const tunconns = [];
    const stunconns = [];
    const dtdconns = [];
    const rfdtdconns = [];
    const nodes = {};
    const validnodes = {};
    const done = {};

    this.props.nodesData.forEach(n => nodes[this.canonicalHostname(n.node)] = n);

    const findTracker = (lqm, targetNode) => {
        if (!lqm || !targetNode) return null;
        const trackers = (lqm.info && lqm.info.trackers) ? lqm.info.trackers : (lqm.trackers ? lqm.trackers : null);
        if (!trackers) return null;

        const targetHostname = this.canonicalHostname(targetNode.node);
        const targetIps = targetNode.interfaces ? targetNode.interfaces.map(i => i.ip) : [];

        return Object.values(trackers).find(t => {
          const tHostname = t.hostname ? this.canonicalHostname(t.hostname) : "";
          if (tHostname && tHostname === targetHostname) return true;
          if (t.ip && targetIps.includes(t.ip)) return true;
          if (t.canonical_ip && targetIps.includes(t.canonical_ip)) return true;
          return false;
        });
    };

    this.props.nodesData.forEach(n => {
      if (!(n.mlat && n.mlon)) {
        return;
      }
      const icon = getIcon(n);
      switch (this.props.selected) {
        case 'halow':
          if (icon !== HalowIcon) {
            return;
          }
          break;
        case '900':
          if (icon !== MagentaIcon) {
            return;
          }
          break;
        case '24':
          if (icon !== PurpleIcon) {
            return;
          }
          break;
        case '34':
          if (icon !== BlueIcon) {
            return;
          }
          break;
        case '58':
          if (icon !== OrangeIcon) {
            return;
          }
          break;
        case 'supernode':
          if (icon !== GreenIcon) {
            return;
          }
          break;
        case 'off':
          if (icon !== GrayIcon) {
            return;
          }
          break;
        case 'all':
          break;
        default:
          return;
      }
      const fn = this.canonicalHostname(n.node);
      n.link_info.forEach(m => {
        const tn = this.canonicalHostname(m.hostname);
        const to = nodes[tn];
        if (to) {
          if (!to.lat || !to.lon || done[`${tn}/${fn}`]) {
            return;
          }
          
          // Pre-calculate trackers
          const tracker = findTracker(n.lqm, to);
          const reverseTracker = findTracker(to.lqm, n);

          const conn = { 
            pos: [[ n.lat, n.lon ], [ to.lat, to.lon ]], 
            from: fn, 
            to: tn, 
            link: m, 
            neighbor: to, 
            lqm: n.lqm, 
            fromNode: n,
            tracker,
            reverseTracker
          };

          switch (m.linkType) {
            case 'RF':
              rfconns.push(conn);
              break;
            case 'TUN':
            case 'WIREGUARD':
              tunconns.push(conn);
              break;
            case 'DTD': {
              const dfrom = Turf.point([ n.lon, n.lat ]);
              const dto = Turf.point([ to.lon, to.lat ]);
              if (Turf.distance(dfrom, dto, { units: "meters" }) < 50) {
                dtdconns.push(conn);
              }
              else {
                rfdtdconns.push(conn);
              }
              break;
            }
            case 'XLINK':
              rfdtdconns.push(conn);
              break;
            case 'SUPER':
              stunconns.push(conn);
              break;
            default:
              break;
          }
          done[`${tn}/${fn}`] = true;
          done[`${fn}/${tn}`] = true;
        }
      });
      validnodes[fn] = n;
    });

    this.setState({
      graphData: {
        rfconns,
        tunconns,
        stunconns,
        dtdconns,
        rfdtdconns,
        validnodes
      }
    });
  }

  getLinkColor(conn, defaultColor) {
    const { metric, direction } = this.state;
    if (metric === 'default') return defaultColor;

    const m = conn.link;
    if (!m) return defaultColor;

    let value;
    const metricDef = METRICS[metric];

    if (metric === 'snr') {
      if (direction === 'forward') {
        value = (m.signal && m.noise) ? (m.signal - m.noise) : undefined;
      } else {
        const reverseLink = conn.neighbor && conn.neighbor.link_info && conn.neighbor.link_info.find(l => l.hostname && this.canonicalHostname(l.hostname) === conn.from);
        if (reverseLink) {
          value = (reverseLink.signal && reverseLink.noise) ? (reverseLink.signal - reverseLink.noise) : undefined;
        }
      }
    } else if (metric === 'bitrate') {
       // Try to find bitrate in link_info
       if (direction === 'forward') {
          value = m.bitrate || m.rate;
       } else {
          const reverseLink = conn.neighbor && conn.neighbor.link_info && conn.neighbor.link_info.find(l => l.hostname && this.canonicalHostname(l.hostname) === conn.from);
          if (reverseLink) {
             value = reverseLink.bitrate || reverseLink.rate;
          }
       }
    } else {
      // Use pre-calculated trackers
      const { tracker, reverseTracker } = conn;
      let prop = metricDef.prop;
      
      if (direction === 'forward') {
        if (tracker) {
          value = tracker[prop];
        }
      } else {
        // Reverse direction
        if (reverseTracker) {
          value = reverseTracker[prop];
        } else if (tracker) {
          // Fallback to rev_ properties in local tracker if available
          if (metric === 'lq') value = tracker.rev_quality;
          else if (metric === 'ping') value = tracker.rev_ping_success_time;
          else if (metric === 'ping_quality') value = tracker.rev_ping_quality;
        }
      }
    }

    if (value !== undefined && value !== null && metricDef.factor) {
      value = value * metricDef.factor;
    }

    const color = getColor(value, metricDef.min, metricDef.max, metricDef.reverse);
    return color || defaultColor;
  }

  renderLinkPopup(conn) {
    const { from, to, tracker, reverseTracker, link, neighbor } = conn;
    
    const getValue = (t, prop, factor) => {
        if (!t || t[prop] === undefined || t[prop] === null) return '-';
        let val = t[prop];
        if (factor) val *= factor;
        if (typeof val === 'number') return Math.round(val * 100) / 100;
        return val;
    };

    const getSnr = (isReverse) => {
        if (!isReverse) {
            return (link.signal && link.noise) ? (link.signal - link.noise) : '-';
        } else {
             const reverseLink = neighbor && neighbor.link_info && neighbor.link_info.find(l => l.hostname && this.canonicalHostname(l.hostname) === from);
             return (reverseLink && reverseLink.signal && reverseLink.noise) ? (reverseLink.signal - reverseLink.noise) : '-';
        }
    };

    const getBitrate = (isReverse) => {
        if (!isReverse) {
            return link.bitrate || link.rate || '-';
        } else {
             const reverseLink = neighbor && neighbor.link_info && neighbor.link_info.find(l => l.hostname && this.canonicalHostname(l.hostname) === from);
             return (reverseLink && (reverseLink.bitrate || reverseLink.rate)) || '-';
        }
    };

    return (
      <Popup maxWidth="500" className="link-popup">
        <div style={{textAlign: 'center', fontWeight: 'bold', marginBottom: '5px', borderBottom: '1px solid #ccc', paddingBottom: '5px'}}>
            <a href="#" onClick={(e)=>{ e.preventDefault(); this.openPopup(from); }}>{from}</a> 
            <span style={{margin: '0 5px'}}>&harr;</span> 
            <a href="#" onClick={(e)=>{ e.preventDefault(); this.openPopup(to); }}>{to}</a>
        </div>
        <table style={{width: '100%', fontSize: '0.9em', borderCollapse: 'collapse'}}>
            <thead>
                <tr style={{borderBottom: '1px solid #eee'}}>
                    <th style={{textAlign: 'left', padding: '2px'}}>Metric</th>
                    <th style={{textAlign: 'right', padding: '2px'}}>Fwd</th>
                    <th style={{textAlign: 'right', padding: '2px'}}>Rev</th>
                </tr>
            </thead>
            <tbody>
                {Object.keys(METRICS).filter(k => k !== 'default').map(k => {
                    const m = METRICS[k];
                    let fwd = '-';
                    let rev = '-';

                    if (k === 'snr') {
                        fwd = getSnr(false);
                        rev = getSnr(true);
                    } else if (k === 'bitrate') {
                        fwd = getBitrate(false);
                        rev = getBitrate(true);
                    } else {
                        fwd = getValue(tracker, m.prop, m.factor);
                        if (reverseTracker) {
                            rev = getValue(reverseTracker, m.prop, m.factor);
                        } else if (tracker) {
                             if (k === 'lq') rev = getValue(tracker, 'rev_quality');
                             else if (k === 'ping') rev = getValue(tracker, 'rev_ping_success_time', m.factor);
                             else if (k === 'ping_quality') rev = getValue(tracker, 'rev_ping_quality');
                        }
                    }

                    return (
                        <tr key={k} style={{borderBottom: '1px solid #f5f5f5'}}>
                            <td style={{padding: '2px'}}>{m.label}</td>
                            <td style={{textAlign: 'right', padding: '2px'}}>{fwd} {fwd !== '-' ? m.unit : ''}</td>
                            <td style={{textAlign: 'right', padding: '2px'}}>{rev} {rev !== '-' ? m.unit : ''}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
      </Popup>
    );
  }

  renderControls() {
    return (
      <div className="map-controls" style={{
        position: 'absolute',
        top: '10px',
        left: '60px',
        zIndex: 1000,
        backgroundColor: 'white',
        padding: '10px',
        color: 'black',
        borderRadius: '5px',
        boxShadow: '0 0 5px rgba(0,0,0,0.5)',
        pointerEvents: 'auto'
      }}>
        <div style={{marginBottom: '5px'}}>
          <label style={{marginRight: '5px'}}>Metric:</label>
          <select value={this.state.metric} onChange={(e) => this.setState({ metric: e.target.value })}>
            {Object.keys(METRICS).map(k => (
              <option key={k} value={k}>{METRICS[k].label}</option>
            ))}
          </select>
        </div>
        {this.state.metric !== 'default' && (
          <div>
            <label style={{marginRight: '5px'}}>Direction:</label>
            <select value={this.state.direction} onChange={(e) => this.setState({ direction: e.target.value })}>
              <option value="forward">Forward</option>
              <option value="reverse">Reverse</option>
            </select>
          </div>
        )}
        {this.state.metric !== 'default' && (
           <div style={{marginTop: '5px', fontSize: '0.8em'}}>
             <span>Low</span>
             <div style={{
               display: 'inline-block',
               width: '100px',
               height: '10px',
               background: METRICS[this.state.metric].reverse ? 'linear-gradient(to right, green, yellow, red)' : 'linear-gradient(to right, red, yellow, green)',
               margin: '0 5px'
             }}></div>
             <span>High</span>
           </div>
        )}
      </div>
    );
  }

  render() {
    if(!this.props.appConfig) {
      return null;
    }

    if (!this.state.tile_url) {
      Promise.all(this.props.appConfig.mapSettings.servers.map(async tile => {
        try {
          if (tile.test) {
            return await new Promise(resolve => {
              const img = document.createElement("img");
              img.onload = () => resolve(tile.url);
              img.onerror = () => resolve(null);
              img.src = tile.test;
              setTimeout(() => {
                if (!img.complete) {
                  resolve(null);
                }
              }, 1000);
            });
          }
          else {
            return tile.url;
          }
        }
        catch {
          return null;
        }
      })).then(urls => {
        const url = urls.find(item => item);
        this.setState({ tile_url: url });
      });
      return null;
    }

    const { rfconns, tunconns, stunconns, dtdconns, rfdtdconns, validnodes } = this.state.graphData;
    const nodes = {};
    this.props.nodesData.forEach(n => nodes[this.canonicalHostname(n.node)] = n);

    const mhref = (n) => {
      return this.props.appConfig.active === false ? <a>{n.node}</a> : <a href={`http://${n.node}.local.mesh`} target="_blank" rel="noreferrer">{n.node}</a>
    }
    const mapCenter = [this.props.appConfig.mapSettings.mapCenter.lat, this.props.appConfig.mapSettings.mapCenter.lon];
    return (
      <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {this.renderControls()}
      <MapContainer 
        ref={this.mapRef} 
        className="Map" 
        center={mapCenter} 
        zoom={this.props.appConfig.mapSettings.zoom} 
        scrollWheelZoom={true}
        minZoom={3}
        maxBounds={[[-90, -180], [90, 180]]}
        maxBoundsViscosity={1.0}
      >
        <TileLayer
          attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
          url={this.state.tile_url}
        />
        {
          rfconns.map(conn =>
            <Polyline color={this.getLinkColor(conn, "limegreen")} weight="2" positions={conn.pos} key={conn.from + conn.to + this.state.metric + this.state.direction}>
              {this.renderLinkPopup(conn)}
            </Polyline>
          )
        }
        {
          tunconns.map(conn =>
            <Polyline color={this.getLinkColor(conn, "grey")} weight="2" dashArray="5 5" positions={conn.pos} key={conn.from + conn.to + this.state.metric + this.state.direction}>
              {this.renderLinkPopup(conn)}
            </Polyline>
          )
        }
        {
          stunconns.map(conn =>
            <Polyline color={this.getLinkColor(conn, "blue")} weight="2" dashArray="5 5" positions={conn.pos} key={conn.from + conn.to + this.state.metric + this.state.direction}>
              {this.renderLinkPopup(conn)}
            </Polyline>
          )
        }
        {
          dtdconns.map(conn =>
            <Polyline color={this.getLinkColor(conn, "cadetblue")} weight="2" dashArray="1 10" positions={conn.pos} key={conn.from + conn.to + this.state.metric + this.state.direction}>
              {this.renderLinkPopup(conn)}
            </Polyline>
          )
        }
        {
          rfdtdconns.map(conn =>
            <Polyline color={this.getLinkColor(conn, "limegreen")} weight="3" dashArray="2 6" positions={conn.pos} key={conn.from + conn.to + this.state.metric + this.state.direction}>
              {this.renderLinkPopup(conn)}
            </Polyline>
          )
        }
        { 
          Object.values(validnodes).map(n =>
            <div key={n.node}>
              <AzimuthPointer azimuth={n.meshrf.azimuth} lat={n.mlat} lon={n.mlon} />
              <Marker ref={(el) => this.setMarkerRef(el, n.node.toUpperCase())} key={n.node} position={[n.mlat,n.mlon]} icon={ getIcon(n) }>
                <Popup minWidth="240" maxWidth="380"> {
                  <div><h6>{mhref(n)}</h6>
                    <table>
                      <tbody>
                        {n.node_details.description &&
                          <tr style={{verticalAlign:"top"}}><td>Description</td><td>{n.node_details.description.replace("&deg;", "\u00B0")}</td></tr>
                        }
                        <tr><td>Location</td><td>{n.lat},{n.lon}</td></tr>
                        {n.meshrf.antenna && n.meshrf.antenna.description &&
                          <tr style={{verticalAlign:"top"}}><td>Antenna</td><td>{n.meshrf.antenna.description.replace("&deg;", "\u00B0")}</td></tr>
                        }
                        {!isNaN(n.meshrf.height) && 
                        <tr><td>Height</td><td>{n.meshrf.height} m</td></tr>
                        }
                        {!isNaN(n.meshrf.azimuth) &&
                          <tr><td>Azimuth</td><td>{n.meshrf.azimuth}&deg;</td></tr>
                        }
                        {!isNaN(n.meshrf.elevation) &&
                          <tr><td>Elevation</td><td>{n.meshrf.elevation}&deg;</td></tr>
                        }
                        <tr><td>RF Status</td><td style={{textTransform: "capitalize"}}>{n.meshrf.status}</td></tr>
                        { n.meshrf.status === 'on' && <tbody>
                            <tr><td>SSID</td><td>{n.meshrf.ssid}</td></tr>
                            <tr style={{verticalAlign:"top"}}><td>Channel</td><td>{n.meshrf.channel}</td></tr>
                            <tr><td>Frequency</td><td>{n.meshrf.freq}</td></tr>
                            <tr><td>Bandwidth</td><td>{n.meshrf.chanbw} MHz</td></tr>
                            <tr><td>LQM</td><td>{n.lqm && n.lqm.enabled ? 'Enabled' : n.lqm ? 'Disabled' : 'Unavailable'}</td></tr>
                            <tr><td>MAC</td><td>{n.interfaces[0].mac}</td></tr>
                            </tbody>
                        }
                        <tr style={{verticalAlign:"top"}}><td>Hardware</td><td>{hardware(n.node_details.board_id) || n.node_details.model}</td></tr>
                        <tr><td width="80">Firmware</td><td>{n.node_details.firmware_version}</td></tr>
                        <tr style={{verticalAlign:"top",whiteSpace:"nowrap"}}><td>Neighbors</td><td> {
                          n.link_info.map(m => {
                            const cname = this.canonicalHostname(n.node);
                            const chostname = this.canonicalHostname(m.hostname);
                            const hn = nodes[chostname];
                            if (hn && m.linkType) {
                              let info = "";
                              if (n.lat && n.lon && hn.lat && hn.lon) {
                                if (m.linkType === "RF") {
                                  const from = Turf.point([ n.lon, n.lat ]);
                                  const to = Turf.point([ hn.lon, hn.lat ]);
                                  const bearing = (360 + Math.round(Turf.bearing(from, to, { units: "degrees" }))) % 360;
                                  const distance = Turf.distance(from, to, { units: "miles" }).toFixed(1);
                                  if (parseFloat(distance) > 0) {
                                    let sigf = m.signal - m.noise;
                                    if (isNaN(sigf)) {
                                      sigf = '-';
                                    }
                                    const hl = hn.link_info.find(info => this.canonicalHostname(info.hostname) === cname);
                                    let sigt = hl ? hl.signal - hl.noise : '-';
                                    if (isNaN(sigt)) {
                                      sigt = '-';
                                    }
                                    info = `${sigf} dB \u2190 ${bearing}\u00B0 ${distance} miles \u2192 ${sigt} dB`;
                                  }
                                }
                                else if (m.linkType == "XLINK") {
                                  const from = Turf.point([ n.lon, n.lat ]);
                                  const to = Turf.point([ hn.lon, hn.lat ]);
                                  const bearing = (360 + Math.round(Turf.bearing(from, to, { units: "degrees" }))) % 360;
                                  const distance = Turf.distance(from, to, { units: "miles" }).toFixed(1);
                                  if (parseFloat(distance) > 0) {
                                    info = `${bearing}\u00B0 ${distance} miles`;
                                  }
                                }
                              }
                              return <div key={m.hostname}>
                                <div><a href="#" onClick={()=>this.openPopup(m.hostname)}>{chostname}</a> <span className="linktype">{m.linkType}</span></div>
                                <div className="bearing">{info}</div>
                              </div>
                            }
                            else {
                              return <div key={m.hostname}>{this.canonicalHostname(m.hostname)} <span className="linktype">{ m.linkType ? `${m.linkType}` : "" }</span></div>
                            }
                          })
                        } </td></tr>
                      </tbody>
                    </table>
                  </div>
                } </Popup>
              </Marker>
            </div>
          )
        }
      </MapContainer>
      </div>
    );
  }

  openPopup(id) {
    const popup = this.markers[this.canonicalHostname(id)];
    if (popup) {
      popup.fireEvent('click');
    }
  }

  canonicalHostname(hostname) {
    if (typeof hostname !== 'string') return "";
    return hostname.replace(/^\./, '').replace(/\.local\.mesh$/i,'').toUpperCase()
  }
}
