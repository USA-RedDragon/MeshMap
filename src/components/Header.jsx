import { Component } from "react";
import PropTypes from "prop-types";
import { freqStartsWith } from "../utils/freq";
import meshIconUrl from "../img/mesh_icon.svg";

class Header extends Component {

  state = { 
    selected: 'all'
  }

  countNodes(nodesData, band) {
    switch(band) {
      case 'halow':
        return nodesData.filter(n => n.meshrf.freq && n.meshrf.status === "on" && (freqStartsWith(n.meshrf.freq, "9") && (n.meshrf.chanbw === 1 || n.meshrf.chanbw === 2 || n.meshrf.chanbw === 4 || n.meshrf.chanbw === 8 || n.meshrf.chanbw === "1" || n.meshrf.chanbw === "2" || n.meshrf.chanbw === "4" || n.meshrf.chanbw === "8"))).length;
      case 900:
        return nodesData.filter(n => n.meshrf.freq && n.meshrf.status === "on" && (freqStartsWith(n.meshrf.freq, "9") && !(n.meshrf.chanbw === 1 || n.meshrf.chanbw === 2 || n.meshrf.chanbw === 4 || n.meshrf.chanbw === 8 || n.meshrf.chanbw === "1" || n.meshrf.chanbw === "2" || n.meshrf.chanbw === "4" || n.meshrf.chanbw === "8"))).length;
      case 24:
        return nodesData.filter(n => n.meshrf.freq && n.meshrf.status === "on" && freqStartsWith(n.meshrf.freq, "2")).length;
      case 34:
        return nodesData.filter(n => n.meshrf.freq && n.meshrf.status === "on" && (freqStartsWith(n.meshrf.freq, "3") || (n.meshrf.channel >= 3380 && n.meshrf.channel <= 3495))).length;
      case 58:
        return nodesData.filter(n => n.meshrf.freq && n.meshrf.status === "on" && freqStartsWith(n.meshrf.freq, "5") && !(n.meshrf.channel >= 3380 && n.meshrf.channel <= 3495)).length;
      case 'supernode':
        return nodesData.filter(n => n.node_details.mesh_supernode).length;
      case 'off':
        return nodesData.filter(n => n.meshrf.status === "off").length;
      case 'all':
      default:
        return this.countNodes(nodesData, 900) + this.countNodes(nodesData, 24) + this.countNodes(nodesData, 34) + this.countNodes(nodesData, 58) + this.countNodes(nodesData, 'halow') + this.countNodes(nodesData, 'off');
    }
  }

  selectNodes(type) {
    if (type === this.state.selected) {
      type = 'all';
    }
    this.setState({ selected: type });
    this.props.selectNodes(type);
  }

  render() {
    if (!this.props.appConfig) {
      return null;
    }
    const counts = {
      b900: this.countNodes(this.props.nodesData, 900),
      b24: this.countNodes(this.props.nodesData, 24),
      b34: this.countNodes(this.props.nodesData, 34),
      b58: this.countNodes(this.props.nodesData, 58),
      halow: this.countNodes(this.props.nodesData, 'halow'),
      supernode: this.countNodes(this.props.nodesData, 'supernode'),
      off: this.countNodes(this.props.nodesData, 'off'),
      nonMapped: this.props.nonMapped,
      hostsScraped: this.props.hostsScraped,
      all: this.countNodes(this.props.nodesData, 'all') + (this.props.nonMapped || 0),
    };
    return (
      <div className="Header">
        <div className="title">{this.props.appConfig.name}</div>
        <table>
          <tbody>
            <tr>
              <td>Band</td>
              <td>Nodes</td>
            </tr>
            {
              counts.halow ? <tr className={ 'halow-' + this.state.selected }>
                <td><a href="#" onClick={()=>this.selectNodes('halow')}><div className="mesh-icon mesh-icon-teal" style={{width: 20, height: 20, display: 'inline-block', verticalAlign: 'middle'}}><img src={meshIconUrl} style={{width: '100%', height: '100%', display: 'block'}} /></div> HaLow</a></td>
                <td>{counts.halow}</td>
              </tr> : ""
            }
            {
              counts.b900 ? <tr className={ 'b900-' + this.state.selected }>
                <td><a href="#" onClick={()=>this.selectNodes('900')}><div className="mesh-icon mesh-icon-magenta" style={{width: 20, height: 20, display: 'inline-block', verticalAlign: 'middle'}}><img src={meshIconUrl} style={{width: '100%', height: '100%', display: 'block'}} /></div> 900 MHz</a></td>
                <td>{counts.b900}</td>
              </tr> : ""
            }
            {
              counts.b24 ? <tr className={ 'b24-' + this.state.selected }>
                <td><a href="#" onClick={()=>this.selectNodes('24')}><div className="mesh-icon mesh-icon-purple" style={{width: 20, height: 20, display: 'inline-block', verticalAlign: 'middle'}}><img src={meshIconUrl} style={{width: '100%', height: '100%', display: 'block'}} /></div> 2.4 GHz</a></td>
                <td>{counts.b24}</td>
              </tr> : ""
            }
            {
              counts.b34 ? <tr className={ 'b34-' + this.state.selected }>
                <td><a href="#" onClick={()=>this.selectNodes('34')}><div className="mesh-icon mesh-icon-blue" style={{width: 20, height: 20, display: 'inline-block', verticalAlign: 'middle'}}><img src={meshIconUrl} style={{width: '100%', height: '100%', display: 'block'}} /></div> 3.4 GHz</a></td>
                <td>{counts.b34}</td>
              </tr> : ""
            }
            {
              counts.b58 ? <tr className={ 'b58-' + this.state.selected }>
                <td><a href="#" onClick={()=>this.selectNodes('58')}><div className="mesh-icon mesh-icon-gold" style={{width: 20, height: 20, display: 'inline-block', verticalAlign: 'middle'}}><img src={meshIconUrl} style={{width: '100%', height: '100%', display: 'block'}} /></div> 5 GHz</a></td>
                <td>{counts.b58}</td>
              </tr> : ""
            }
            {
              counts.supernode ? <tr className={ 'supernode-' + this.state.selected }>
                <td><a href="#" onClick={()=>this.selectNodes('supernode')}><div className="mesh-icon mesh-icon-green" style={{width: 20, height: 20, display: 'inline-block', verticalAlign: 'middle'}}><img src={meshIconUrl} style={{width: '100%', height: '100%', display: 'block'}} /></div> Supernode</a></td>
                <td>{counts.supernode}</td>
              </tr> : ""
            }
            {
              counts.off ? <tr className={ 'off-' + this.state.selected }>
                <td><a href="#" onClick={()=>this.selectNodes('off')}><div className="mesh-icon mesh-icon-gray" style={{width: 20, height: 20, display: 'inline-block', verticalAlign: 'middle'}}><img src={meshIconUrl} style={{width: '100%', height: '100%', display: 'block'}} /></div> No RF</a></td>
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
              <td style={{paddingLeft:33}}><a href="#" onClick={()=>this.selectNodes('all')}>Total</a></td>
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
  nodesData: PropTypes.array,
  nonMapped: PropTypes.number,
  hostsScraped: PropTypes.number,
  lastUpdated: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectNodes: PropTypes.func.isRequired,
};

export default Header;
