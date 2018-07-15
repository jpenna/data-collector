const logger = require('debug')('collector:wsHandler');

const BinanceWS = require('./binanceWS');

class WsHandler {
  constructor({ beautify = false, sendMessage, pairs, letterMan }) {
    this.beautify = beautify;
    this.sendMessage = sendMessage;
    this.pairs = pairs;
    this.letterMan = letterMan;

    this.missingSet = new Set();
    this.prevMissingSet = new Set();
    this.startTime = Date.now();

    this.isReplacing = false;
  }

  pairsTimeout() {
    const text = `Timeout. All websockets did not connect on time (2 min)(${this.binanceWS.instance})`;
    logger(text);
    this.sendMessage(`⚠️ ${text}`);

    // If is first ws connection
    if (!this.newBinanceWS) return this.processReplace();

    this.isReplacing = false;
    this.newBinanceWS.drop();
  }

  processReplace() {
    this.isReplacing = true;
    this.newBinanceWS = new BinanceWS({
      beautify: false,
      pairs: this.pairs,
      letterMan: this.letterMan,
      pairsTimeout: this.pairsTimeout.bind(this),
      allConnected: this.allConnected.bind(this),
    });
  }

  // TODO If 3 are missing in main, replace cnx. Else dont replace, just reconnect the missing one. Skip this coin from main. If received back from the main, replace usage and drop the single cnx.
  replace() {
    if (this.newBinanceWS.isDropped) return;
    this.binanceWS.drop();
    this.binanceWS = this.newBinanceWS;
    this.isReplacing = false;
    this.sendMessage(`🔗 New WS connected`);
  }

  start() {
    logger('Start WS Handler');

    this.binanceWS = new BinanceWS({
      beautify: false,
      pairs: this.pairs,
      letterMan: this.letterMan,
      pairsTimeout: this.pairsTimeout.bind(this),
      allConnected: this.allConnected.bind(this),
    });
  }

  allConnected(startConn) {
    logger(`All websockets connected (${startConn ? ((Date.now() - startConn) / 1000).toFixed(2) : '- '}sec)`);
    if (this.isReplacing) this.replace();
    this.binanceWS.upgradeMessageHandler();
    this.checkConnection();
  }

  checkConnection() {
    const runningFor = `(${((Date.now() - this.startTime) / 60000).toFixed(0)} minutes)`;

    // Logs
    if (this.binanceWS.missingPairs.size) {
      const msg = `(${this.binanceWS.instance}) Running for ${runningFor}. Not all assets are running (${this.binanceWS.missingPairs.size}): ${this.binanceWS.missingPairs.toString()}. Replacing: ${this.isReplacing}.`;
      logger(msg);
    } else {
      logger(`(${this.binanceWS.instance}) All assets are running ${runningFor}`);
    }

    const startReplace = this.binanceWS.missingPairs.checkThreshold();

    if (startReplace && !this.isReplacing) {
      this.processReplace();
    } else if (this.isReplacing && !startReplace) {
      this.isReplacing = false;
      this.newBinanceWS.abort();
      this.sendMessage(`🔗 Reconnected with same WS`);
    } else if (!this.isReplacing && this.binanceWS.missingPairs.size) {
      console.log(`Start singles (${this.binanceWS.instance})`);
      this.binanceWS.processSingleWS();
    }

    clearTimeout(this.checkConnectionTimeout);
    this.checkConnectionTimeout = setTimeout(this.checkConnection.bind(this), 120000); // 2 minutes
  }
}

module.exports = WsHandler;