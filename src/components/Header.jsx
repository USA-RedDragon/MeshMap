import { Component } from "react";
import PropTypes from "prop-types";
import { BANDS } from "../lib/meshData";
import { meshIconUrl } from "../lib/meshImages";
import { useColorMode } from "../hooks/useColorMode";

const LEGEND_PX = 20;

function LegendIcon({ band }) {
  const { isDark } = useColorMode();
  return <img className="mesh-icon" src={meshIconUrl(BANDS[band].color, LEGEND_PX, isDark)} width={LEGEND_PX} height={LEGEND_PX} alt="" />;
}
LegendIcon.propTypes = { band: PropTypes.string.isRequired };

const legendIcon = (band) => <LegendIcon band={band} />;

class Header extends Component {

  selectNodes(e, type) {
    e.preventDefault();
    if (type === this.props.selected) {
      type = 'all';
    }
    this.props.selectNodes(type);
  }

  render() {
    if (!this.props.appConfig) {
      return null;
    }
    const c = this.props.counts || {};
    const counts = {
      b900: c[900],
      b24: c[24],
      b34: c[34],
      b58: c[58],
      halow: c.halow,
      supernode: c.supernode,
      off: c.off,
      nonMapped: this.props.nonMapped,
      hostsScraped: this.props.hostsScraped,
      all: (c.all || 0) + (this.props.nonMapped || 0),
    };
    if (!this.props.open) {
      return (
        <div className="Header collapsed">
          <button type="button" className="panel-toggle" onClick={() => this.props.setOpen(true)} aria-expanded="false">{this.props.appConfig.name}</button>
        </div>
      );
    }
    return (
      <div className="Header">
        <button type="button" className="panel-toggle panel-close" onClick={() => this.props.setOpen(false)} aria-expanded="true" title="Hide">Hide</button>
        <div className="title">{this.props.appConfig.name}</div>
        <table>
          <tbody>
            <tr>
              <td>Band</td>
              <td>Nodes</td>
            </tr>
            {
              counts.halow ? <tr className={ 'halow-' + this.props.selected }>
                <td><a href="#" onClick={(e)=>this.selectNodes(e, 'halow')}>{legendIcon("halow")} HaLow</a></td>
                <td>{counts.halow}</td>
              </tr> : ""
            }
            {
              counts.b900 ? <tr className={ 'b900-' + this.props.selected }>
                <td><a href="#" onClick={(e)=>this.selectNodes(e, '900')}>{legendIcon("900")} 900 MHz</a></td>
                <td>{counts.b900}</td>
              </tr> : ""
            }
            {
              counts.b24 ? <tr className={ 'b24-' + this.props.selected }>
                <td><a href="#" onClick={(e)=>this.selectNodes(e, '24')}>{legendIcon("24")} 2.4 GHz</a></td>
                <td>{counts.b24}</td>
              </tr> : ""
            }
            {
              counts.b34 ? <tr className={ 'b34-' + this.props.selected }>
                <td><a href="#" onClick={(e)=>this.selectNodes(e, '34')}>{legendIcon("34")} 3.4 GHz</a></td>
                <td>{counts.b34}</td>
              </tr> : ""
            }
            {
              counts.b58 ? <tr className={ 'b58-' + this.props.selected }>
                <td><a href="#" onClick={(e)=>this.selectNodes(e, '58')}>{legendIcon("58")} 5 GHz</a></td>
                <td>{counts.b58}</td>
              </tr> : ""
            }
            {
              counts.supernode ? <tr className={ 'supernode-' + this.props.selected }>
                <td><a href="#" onClick={(e)=>this.selectNodes(e, 'supernode')}>{legendIcon("supernode")} Supernode</a></td>
                <td>{counts.supernode}</td>
              </tr> : ""
            }
            {
              counts.off ? <tr className={ 'off-' + this.props.selected }>
                <td><a href="#" onClick={(e)=>this.selectNodes(e, 'off')}>{legendIcon("off")} No RF</a></td>
                <td>{counts.off}</td>
              </tr> : ""
            }
            {
              counts.nonMapped ? <tr>
                <td style={{paddingLeft:33}}>No Location</td>
                <td>{counts.nonMapped}</td>
              </tr> : ""
            }
            <tr>
              <td style={{paddingLeft:33}}><a href="#" onClick={(e)=>this.selectNodes(e, 'all')}>Total</a></td>
              <td>{counts.all}</td>
            </tr>
            {
              counts.hostsScraped ? <tr>
                <td style={{paddingLeft:33}}>Scraped Hosts</td>
                <td>{counts.hostsScraped}</td>
              </tr> : ""
            }
          </tbody>
        </table>
        {
          !this.props.lastUpdated ?
            <div className="footer">Last updated {(new Date().toLocaleString())}</div> :
            <div>
              <div className="footer">Last updated {(new Date(this.props.lastUpdated).toLocaleString())}</div>
            </div>
        }
      </div>
    );
  }
}

Header.propTypes = {
  appConfig: PropTypes.object,
  counts: PropTypes.object,
  nonMapped: PropTypes.number,
  hostsScraped: PropTypes.number,
  lastUpdated: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectNodes: PropTypes.func.isRequired,
  selected: PropTypes.string,
  open: PropTypes.bool,
  setOpen: PropTypes.func,
};

Header.defaultProps = {
  selected: 'all',
  open: true,
  setOpen: () => {},
};

export default Header;
