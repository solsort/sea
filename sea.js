// # Sea
// 
// The goal of Sea is to become the distributed computing platform, running peer-to-peer in the webbrowser. 
// 
// The initial use case is to make apps with pub-sub and connections, with no backend.
// 
// Sea will be built upon, and only run within, modern browser engines. The network stack builds upon WebRTC Data Channels. Computation is done with WebAssembly. This is currently only available in Firefox from version 52 and Chrome from version 57, but the remaining browsers are expected to catch up within the near future. 
// 
// Bootstrap servers are electron apps, which allows incoming connections by having an open secure websocket server. Otherwise they are identical to the other peers in the sea. Bootstrap servers are only used to make the initial connection. All other connections are created peer-to-peer through the sea.
// 
// 
// ## Intended API
// 
// ***Under development***
// 
// ### Public API:
// 
// - addresses
//     - `sea.addr(key) →  Promise(addr)` Public address, given a channel id.
//     - `sea.id` - the address of this node
// - emitting messages
//     - `sea.sendAll(addr, name, msg)` sends a message multicast to a channel
//     - `sea.sendAny(addr, name, msg)` sends a message anycast to a channel
//     - `sea.call(addr, name, msg) →  Promise` - same as create a temporary endpoint with a `random_name` on `sea.incoming` and then sendAny `{reply: local.id, replyName: random_name, ...msg}`.
// - channels
//     - `sea.join(key) →  Promise(Chan)` connect/create/join a channel (notice, keeps connections open to other nodes in the channel, and regularly broadcast membership to the network, which takes some bandwidth)
//     - `sea.incoming` - channel for local node. Messages sent to `sea.id` can be received here.
// - methods on `Chan` objects (extends EventEmitter):
//     - `chan.on(name, fn)` handle incoming messages. `sea.send(sea.addr(key), name, msg)` end up at `sea.join(key).on(name, fn)`
//     - `chan.leave()` disconnect from a channel.
//     - `chan.rejoin()` reconnect to channel after leave has been called.
//     - `chan.send(name, msg)` same as `sea.send(sea.addr(key), name, msg)`
//     - `chan.exportFn(name, fn)` same as `chan.on` + send result possibly async fn to `{dst: msg.reply, name: msg.replyName, ...}`
// 
// Message properties:
// 
// - `name` target mailbox
// - `dst` target address
// - `src` original sender
// - `ts` sending timestamp for message, based on local estimated/median clock.
// - `data` actual data
// - `error` error
// - `reply` address to reply to
// - `replyName` name/mailbox to reply to
// - `multicast` true if the message should be send to all nodes in the channel
//
// 
// ### Private
//
// - `sea.connections` - list of current connections
//
// Connection state:
//
// - `connections`: list of current connections
// - `channels`: list of current channels
//
// # Tasks / notes
//
// - use designed api
// - expand connections
// - Make webrtc work in firefox (new ... instead of js-object for ice)
//
// ## Changelog
// ## Roadmap / API
// 
// - √Websocket bootstrap gateway
// - √Establish webrtc through neighbours
// - Propagate connection state to neighbours
// - Iteratively connect to nodes nearest to routing points.
// - Routing across network
// - Tagging / DHT with short TTL, and nodes as values
// - Multicast
// - Keep track of number open channels, and disconnect from network if they reach zero / reconnect if above zero.
// 
// Menial tasks
// - refactor addresses to be base64 strings.
// - apply handshake on webrtc connections.
// 
// Later: Economic system, DHT, Groups / broadcast, ticktock, Blockchain, simple php bootstrap
// 
// ## Connection data structure
// 
// ```yaml
// - id: "c2FtcGxl.."
//   connected: true
//   pubkey: "UHViS2V5..."
//   send: Function
//   on: event-handler: message
//   latency: 123
//   connections:
//     - id: "Rmlyc3Q...":
//       pubkey: "Zmlyc3Q..."
//       latency: 123
//     - id: "U2Vjb25k..."
//       pubkey: "c2Vjb25k..."
//       latency: 123
// ```
// 
// 
// ## General Concepts
// 
// Concepts:
// 
// - An *entity* has a balance of credit to/from other entities, and is able to add a verifiable signature to data.
// - A *node* is a computer(webbrowser/server/smartphone/...) connected to other nodes in the *sea*. A node is a computational *entity*, and can make sigatures via public/private-key cryptography. A node has resources: storage, network, computing power, - and can deliver this as services to other entities. Services can be paid by updating the credit balance between the entities.
// - The *sea* is the entire network of online connected nodes.
// 
// Long term vision:
// 
// - sharing/market of computing resources
// - economic system
// - shared "clock" with a "tick" each ~10 sec / blockchain with list of all peers, and common accounting
//     - secure computations / contracts running on top of the blockchain.
//     - storage within the sea
// # Sea.js
//
let EventEmitter = require('events');
let {dist, hashAddress} = require('hashaddress');
let sea = new EventEmitter();
window.nodesea = module.exports = sea;

// ## Public API
// 
sea.addr = hashAddress; // ###
sea.id = undefined; // ### generated from main()
class Chan extends EventEmitter { // ###
  constructor(key, id) { // ####
    super();
    this.key = key;
    this.id = id;
    this.refs = 0;
  }
  leave() { // ####
    --this.refs;
  }
  rejoin() { // ####
    ++this.refs;
  }
  sendAny(name, msg) { // ####
    sea.sendAny(this.id, name, msg);
  }
  sendAll(name, msg) { // ####
    sea.sendAll(this.id, name, msg);
  }
  exportFn(name, f) { // ####
    this.on(name, async (msg) => {
      let response = { type: msg.replyType, dst: msg.reply};
      try {
        response.data = await Promise.resolve(f.apply(f, msg.data));
      } catch(e) {
        response.error = String(e);
      }
      relay(response);
    });
  }
}

sea.join = async function(key) { // ###
  let chan = sea.chans[key] || new chan(key, await sea.addr(key));
  ++chans.refs;
}

sea.incoming = new Chan(); // ###

sea.call = function call(dst, type) { // ###
  let args = slice(arguments, 2);
  log('call ' + type, dst, type, args, arguments);
  return new Promise((resolve, reject) => {
    let id = randomId();
    sea.incoming.once(id, msg => msg.error ? reject(msg.error) : resolve(msg.data));
    setTimeout(() => sea.incoming.emit(id, {error: 'timeout'}), timeout);
    relay({dst, type, reply: sea.id, replyType: id, data: args});
  });
}

// ## Private API methods

sea.incoming.exportFn('call', sea.call); // ###
sea.chans = {};
// ## Connections
sea.connections = [];
function getConnections() { // ###
  return sea.connections
    .filter(o => o.connected)
    .map(o => o.id);
}

function getConnection(id) { // ###
  let con = (sea.connections.filter(o => o.id === id)||[])[0];
  if(!con) {
    con = new EventEmitter();
    con.outgoing = [];
    con.send = (msg) => con.outgoing.push(msg);
    con.id = id;
    con.pubKey = undefined;
    con.connected = false;
    con.con = undefined;
    con.latency = 65535;
    con.timestamp = Date.now();
    con.peers = [];
    sea.connections.push(con);
    sea.emit('connections');
  }
  return con;
}

function removeConnection(id) { // ###
  for(let i = 0; i < sea.connections.length; ++i) {
    if(sea.connections[i].id === id) {
      sea.connections[i] = sea.connections[sea.connections.length - 1];
      sea.connections.pop();
      sea.emit('connections');
      return;
    }
  }
}

function nearestConnection(adr) { // ###
  let id = findMin(getConnections(), str => hashDist(str, adr));
  return getConnection(id);
}

// ## Utility functions
function log() { // ###
  let s = str(slice(arguments))
  console.log.apply(console, arguments);
  if(typeof document !== 'undefined') {
    let elem = document.getElementById('info');
    if(elem) {
      elem.innerHTML += 
        new Date().toISOString().slice(11,23) + ' ' + 
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').slice(1,-1) + 
        '\n';
    }
  }
  return arguments[arguments.length - 1];
}

main();
function hashDist(s1, s2) { // ###
  console.log(s1, s2, dist(s1, s2));
  return dist(s1, s2);
}

function slice(o, a, b) { return Array.prototype.slice.call(o, a, b); }
let randomId = () => Math.random().toString(36).slice(2,10);
let timeout = 5000;
function findMin(arr, f) { // ###
  arr = arr || [];
  let min = arr[0];
  for(let i = 1; i < arr.length; ++i) {
    if(f(arr[i]) < f(min)) {
      min = arr[i];
    }
  }
  return min;
}

function encode(obj) { // ###
  return JSON.stringify(obj);
}

function decode(obj) { // ###
  return JSON.parse(obj);
}

function sleep(ms) {// ###
  return new Promise(resolve => setTimeout(resolve, ms));
}

function str(o) { // ###
  try {
    return JSON.stringify(o);
  } catch(e) {
    o.toString();
  }
}


// ## WebSocket connections
function startWsServer() { // ###
  let server = node_modules.http.createServer();
  let  wss = new node_modules.ws.Server({server: server});

  wss.on('connection', (ws) => {
    var messageHandler;
    var closeHandler;
    handshake({
      send: o => ws.send(encode(o)),
      onMessage: f => messageHandler = f,
      onClose: f => closeHandler = f,
    });
    ws.on('message', (msg) => messageHandler(decode(msg)));
    ws.on('close', () => closeHandler());
  });

  server.listen(8888, () => {
    log('Started websocket server on port: ' + server.address().port);
  });
}

function connectToWs(host) { // ###
  return new Promise((resolve, reject) => {
    let ws = new WebSocket(host);
    ws.binaryType = 'arraybuffer';
    var messageHandler = () => {};
    var closeHandler = () => {};
    ws.addEventListener('open', (msg) => {
      handshake({
        send: o => ws.send(encode(o)),
        onMessage: f => messageHandler = f,
        onClose: f => closeHandler = f,
        resolve,
      });
    });
    ws.addEventListener('message', (msg) => messageHandler(decode(msg.data)));
    ws.addEventListener('close', () => closeHandler());
    ws.addEventListener('error', (msg) => { reject(msg); });
  });
}

// ## WebRTC Connections
//
var iceServers; // ###

// Stun server list from https://gist.github.com/zziuni/3741933 

iceServers = ['stun.l.google.com:19302', 'stun1.l.google.com:19302',
  'stun2.l.google.com:19302', 'stun3.l.google.com:19302',
  'stun4.l.google.com:19302', 'stun01.sipphone.com', 'stun.ekiga.net',
  'stun.fwdnet.net', 'stun.ideasip.com', 'stun.iptel.org',
  'stun.rixtelecom.se', 'stun.schlund.de', 'stunserver.org',
  'stun.softjoys.com', 'stun.voiparound.com', 'stun.voipbuster.com',
  'stun.voipstunt.com', 'stun.voxgratia.org', 'stun.xten.com'];
iceServers = iceServers.map(s => ({url: 'stun:' + s}));

async function connectVia(through, id) { // ###

  let con = new RTCPeerConnection({ 'iceServers': iceServers });
  con.onicecandidate = iceHandler(through, id);
  con.onerror = log;

  getConnection(id).con = con;

  let chan = con.createDataChannel("sendChannel", { ordered: false });
  addChanHandler(chan, id);

  let offer = await con.createOffer();
  await con.setLocalDescription(offer);

  let answer = await sea.call(through, 'call', 
    id, 'webrtc-offer', through, sea.id, con.localDescription);
  log('got answer:', answer);
  con.setRemoteDescription(answer);
}
sea.incoming.exportFn('webrtc-offer', // ###
  async (through, id, offer) => { 
    log('webrtc-offer', id, offer);
    con = new RTCPeerConnection();

    getConnection(id).con = con;

    con.ondatachannel = (e) => {
      log('ondatachannel')
      addChanHandler(e.channel, id);
    };

    con.onicecandidate = iceHandler(through, id);
    con.onerror = log;

    await con.setRemoteDescription(offer);
    let answer = await con.createAnswer();
    con.setLocalDescription(answer);
    return answer;
  });
sea.incoming.exportFn('ice', // ###
  (id, ice) => {
    log('addIce', id.slice(0, 5), getConnection(id))
    if(!getConnection(id).connected) {
      getConnection(id).con.addIceCandidate(ice);
    }
    log('ice', id, ice);
  });
function addChanHandler(chan, id) { // ###
  log('chan', chan);
  let messageHandler = () => {};
  let closeHandler = () => {};
  chan.onmessage = (msg) => messageHandler(decode(msg.data));
  chan.onmessage = o => log('onmessage', o.data);
  chan.onopen = () => {
    handshake({
      send: o => chan.send(encode(o)),
      onMessage: f => messageHandler = f,
      onClose: f => closeHandler = f,
    });
    log('chan open', id);
    let con = getConnection(id);
    con.connected = true;
    //setInterval(() => chan.send('hi from ' + sea.id.slice(0, 5)), 1000);
  }
}
function iceHandler(through, id) { // ###
  return (e) => {
    if(!getConnection(id).connected) {
      if(e.candidate) {
        sea.call(through, 'call', id, 'ice', sea.id, e.candidate);
      }
    }
  }
}

// ## General communication structure
//
function relay(msg) { // ###
  let con = nearestConnection(msg.dst);
  if(hashDist(con.id, msg.dst) < hashDist(sea.id, msg.dst)) {
    con.send(msg)
  } else {
    log('dropped', msg.type, msg.dst);
  }
}
function handshake({send, resolve, onMessage, onClose}) { // ###
  send({id: sea.id, peers: getConnections()});
  var id;
  onMessage(msg => {
    id = msg.id;
    let con = getConnection(id);
    con.connected = true;
    con.send = send;
    con.peers = msg.peers;
    sea.emit('connected', id);
    onMessage(msg => sea.id === msg.dst ? sea.incoming.emit(msg.type, msg) : relay(msg));
    if(resolve) resolve();
  });
  onClose(() => {
    sea.emit('disconnected', id);
    log('disconnect', id);
    removeConnection(id);
  });
}
sea.on('connected', (id) => {
  log('cconnected', id);
  for(let con of getConnections()) {
    if(con.id !== id) {
      console.log('send-ccon', con.id);
    }
  }
});
sea.incoming.exportFn('connect-state', (id, op, to) => {
  log('connect', id, op, to);
});

// ## Main

async function main() { // ###

  let key = await crypto.subtle.generateKey({
    name: 'ECDSA', 
    namedCurve: 'P-521'
  }, true, ['sign', 'verify']);
  sea.publicKey = sea.incoming.key = await crypto.subtle.exportKey('spki', key.publicKey);
  sea.id = sea.incoming.id = await hashAddress(sea.publicKey);

  log('My id: ' + sea.id);

  if(self.node_modules) {
    startWsServer();
  } else {
    let connected = false;
    while(!connected) {
      try {
        await goOnline();
        connected = true;
      } catch(e) {
        log('error', e);
        await sleep(1000);
      }
    }
  }
}
async function goOnline() { // ###
  await connectToWs('ws://localhost:8888/');
  let done = false;

  //do {
  //
  let a = findMin(getConnections(), o => hashDist(sea.id, o));
  log(getConnections());
  log('a', a);
  let b = findMin(getConnection(a).peers,  o => hashDist(sea.id, o));
  log('b', b);
  if(!b || hashDist(sea.id, a) < hashDist(sea.id, b)) {
    log('connected');
    done = true;
  } else {
    log('connectVia', a.slice(0,5), b.slice(0,5));
    await connectVia(a, b);
  }

  //  } while(!done);
  //
}

// # Connection visualisation
if(typeof window === 'object' && window.graph) {
  let svg = document.getElementById('graph');

  console.log('svg', svg);

  let simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(function(d) { return d.id; }))
    .force("charge", d3.forceManyBody())
    .force("center", d3.forceCenter(300, 200));

  let nodes = [
    {id:'a', peers: ['b']}, 
    {id: 'b', peers: ['c', 'd']}, 
    {id: 'c', peers: []},
    {id: 'd', peers: ['b', 'c', 'a']}
  ];
  function links() {
    let result = [];
    for(let i = 0; i < nodes.length; ++i) {
      let node = nodes[i];
      for(let j = 0; j < node.peers.length; ++j) {
        result.push({
          source: node.id,
          target: peers[j],
        });
      }
    }
    return result;
  }

  simulation.nodes(nodes).on("tick", ticked);

  simulation.force("link").links(links());

  function ticked() {
    let n = {};
    for(let i = 0; i < nodes.length; ++i) {
      n[nodes[i].id] = nodes[i];
    }
    let ctx = window.graph.getContext('2d');
    ctx.clearRect(0,0, 600, 300);
    for(let i = 0; i < nodes.length; ++i) {
      let node = nodes[i];
      ctx.strokeStyle = '#ccc'
      ctx.beginPath();
      for(let j = 0; j < node.peers.length; ++j) {
        ctx.moveTo(node.x, node.y);
        let dst = n[node.peers[j]];
        ctx.lineTo(dst.x, dst.y);
      }
      ctx.stroke();
    }

    for(let i = 0; i < nodes.length; ++i) {
      let node = nodes[i];
      ctx.fillText(node.id, node.x, node.y );
    }
  }
}
//
