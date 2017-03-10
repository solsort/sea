if(typeof process === 'object'  // isNode
    && process.versions 
    && process.versions.node) {
  nodeMain();
} else { // isBrowser
  setTimeout(browserMain, 200 + 200 * Math.random());
}

function nodeMain() {
  console.log('node');
  var server = require('http').createServer();
  var wss = new (require('ws')).Server({server: server});

  var sockets = {};
  wss.on('connection', (ws) => {
    var id = Math.random().toString(36).slice(2,12);
    ws.send(JSON.stringify({
      mbox: 'welcome',
      id: id,
      peers: Object.keys(sockets)
    }));
    sockets[id] = ws;
    ws.on('message', (msg) => {
      var o = JSON.parse(msg);
      if(sockets[o.dst]) {
        sockets[o.dst].send(msg);
      } 
      console.log(msg);
    });
  });

  server.listen(8888, () => {
    console.log('started on', server.address().port);
  });
}

function print(s) {
  document.body.innerHTML += s;
}

async function browserMain() {
  console.log('browser');
  var id;
  var peerIds;
  var ws = new WebSocket('ws://localhost:8888/');
  ws.addEventListener('message', (msg) => {
    msg = JSON.parse(msg.data);
    console.log(msg);
    switch(msg.mbox) {
      case 'welcome':
        id = msg.id;
        peerIds = msg.peers;
        print(`id: ${id}<br>`);
        if(peerIds.length) {
          connect();
        }
        break;
      case 'ice':
        connect(msg);
        break;
    }
  });

  // Stun server list from https://gist.github.com/zziuni/3741933
  var iceServers = ['stun.l.google.com:19302', 'stun1.l.google.com:19302',
  'stun2.l.google.com:19302', 'stun3.l.google.com:19302',
  'stun4.l.google.com:19302', 'stun01.sipphone.com', 'stun.ekiga.net',
  'stun.fwdnet.net', 'stun.ideasip.com', 'stun.iptel.org',
  'stun.rixtelecom.se', 'stun.schlund.de', 'stunserver.org',
  'stun.softjoys.com', 'stun.voiparound.com', 'stun.voipbuster.com',
  'stun.voipstunt.com', 'stun.voxgratia.org', 'stun.xten.com'];
  iceServers = iceServers.map(s => ({url: 'stun:' + s}));

  var connections = self.cons = {};
  var chans = self.chans = {};

  function setupChan(chan, target) {
    chan.onopen = (e) => {
      console.log('onopen', e);
      setTimeout(() => e.target.send('hello'), 500);
    };
    chan.onmessage = (e) => {
      console.log('onmessage', e);
    };
    chan.onclose= (e) => {
      console.log('onclose', e);
    };
    chans[target ] = chan;
  }

  function getCon(target, createChan) {
    if(connections[target]) {
      return connections[target];
    }

    var con = new RTCPeerConnection({ 'iceServers': iceServers });
    con.ondatachannel = (e) => {
      setupChan(e.channel);
      console.log('ondatachannel', e);
      e.channel.send('hi');
    };
    con.onicecandidate = (e) => {
      if(e.candidate) {
        ws.send(JSON.stringify({
          src: id,
          dst: target,
          mbox: 'ice', 
          ice: con.localDescription, 
        }));
      } else {
      }
      console.log('onicecandidata', e);
    }
    connections[target] = con;

    if(createChan) {
      var chan = con.createDataChannel("sendChannel", {
        ordered: false
      });
      setupChan(chan, target);
    }
    return con;
  }

  async function connect(msg) {
    console.log('connect', msg);
    if(!msg) {
      var con = getCon(peerIds[0], true);
      var offer = await con.createOffer();
      con.setLocalDescription(offer);

    } else if(msg.ice) {
      console.log('got ice', msg.ice);
      var con = getCon(msg.src);
      con.setRemoteDescription(new RTCSessionDescription(msg.ice));

      if(msg.ice.type === 'offer') {
        var answer = await con.createAnswer();
        con.setLocalDescription(answer);
      }
    }
  }
}
