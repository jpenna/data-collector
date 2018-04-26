const fs = require('fs');
const dbDebug = require('debug')('collector:persist');
const errorsLog = require('simple-node-logger').createSimpleLogger('logs/errors.log');

const { gracefulExit } = require('../tools/gracefulExit');

class DbManager {
  constructor({ pairs }) {
    this.writting = new Map();
    this.pairs = pairs;
    this.writeStreams = new Map();
    this.notFirstWrite = new Set();
    gracefulExit(this.onExit.bind(this));
    this.setStreams();
  }

  onExit() {
    return new Promise((function rerun(resolve) {
      const { length: wait } = Array.from(this.writting.values()).filter(v => v);
      if (!wait) {
        this.writeStreams.forEach(stream => stream.end(']'));
        resolve();
      }
      dbDebug(`Waiting all writes to finish. Count: ${wait}`);
      setTimeout(rerun.bind(this, resolve), 100);
    }).bind(this));
  }

  setStreams() {
    fs.mkdirSync(`logs/${global.timeCoinmanCollectorStarted}`);
    this.pairs.forEach((pair) => {
      const fd = fs.openSync(`logs/${global.timeCoinmanCollectorStarted}/${pair}_ws.json`, 'wx');
      const writeStream = fs.createWriteStream('', { fd });
      writeStream.write('[');

      writeStream.on('error', (err) => { // eslint-disable-line
        dbDebug(`Error writting to Stream ${pair}`, err);
        errorsLog.error(`Error writting to Stream ${pair}`, err);
      }); // eslint-disable-line
      writeStream.on('drain', function () { // eslint-disable-line
        this.writting.set(pair, false);
      });

      const originalWrite = Object.getPrototypeOf(writeStream).write;

      writeStream.write = (function newWrite(_pair, notFirstWrite, string) {
        if (notFirstWrite.has(_pair)) {
          writeStream.write = originalWrite;
          return writeStream.write(string);
        }
        const removeComma = string.substr(1);
        notFirstWrite.add(_pair);
        return originalWrite.call(writeStream, removeComma);
      }).bind(writeStream, pair, this.notFirstWrite);

      this.writeStreams.set(pair, writeStream);
    });
  }

  isReady() {
    return new Promise((function rerun(res) {
      setTimeout(() => {
        if (this.writeStreams.size === this.pairs.length) return res();
        rerun(res);
      }, 100);
    }).bind(this));
  }

  addKline(pair, data) {
    const ready = this.writeStreams.get(pair).write(`,${JSON.stringify(data)}`);
    if (!ready) this.writting.set(pair, true);
  }

  writeREST({ pair, data }) { // eslint-disable-line
    const path = `logs/${global.timeCoinmanCollectorStarted}/${pair}_rest.json`;
    fs.writeFile(path, JSON.stringify(data), (err) => {
      if (err) dbDebug(`Error writing to REST ${pair}`, err);
    });
  }
}

module.exports = DbManager;
