const fs = require('fs');
const errorLog = require('debug')('collector:core');
const debugSystem = require('debug')('collector:system');
const { extraInfoSymbol } = require('./tools/gracefulExit');

try {
  fs.mkdirSync('logs');
} catch (e) { /* empty */ }

const {
  telegram,
  DbManager,
  fetcher,
  LetterMan,
} = require('./core');

const pairs = ['BNBBTC', 'XLMBTC', 'XVGBTC', 'TRXBTC', 'ETHBTC', 'QTUMBTC', 'ADABTC', 'LUNBTC', 'ARKBTC', 'LSKBTC', 'ZRXBTC', 'XRPBTC'];
// const pairs = ['ETHBTC', 'LUNBTC', 'XVGBTC', 'ARKBTC'];
// const pairs = ['ETHBTC', 'XRPBTC'];

debugSystem(`Initializing Collector at PID ${process.pid}`);

const { sendMessage } = telegram.init();

const sourceSet = new Set([{ source: 'BNB', interval: '30m', pairs }]);

const dbManager = new DbManager({ sourceSet });
const letterMan = new LetterMan({ dbManager, extraInfoSymbol });

const binanceRest = require('./exchanges/binanceRest');
const WsHandler = require('./exchanges/wsHandler');

const wsHandler = new WsHandler({ beautify: false, sendMessage, pairs, letterMan });

const bnbRest = binanceRest({ beautify: false });

const init = fetcher({ binanceRest: bnbRest, pairs });

let interval = 1000;

const dbManagerStarting = dbManager.setStreams();

async function startCollecting() {
  let data;

  try {
    data = await init.fetchInitialData();
  } catch (e) {
    errorLog('Error fetching initial data. Retrying.', e);
    setTimeout(() => {
      if (interval < 10000) interval += 1000;
      startCollecting();
    }, interval);
    return;
  }

  await dbManagerStarting;

  data.forEach((d, index) => {
    letterMan.initialBinanceCandles({
      pair: pairs[index],
      interval: '30m',
      data: d,
    });
  });

  wsHandler.start();
}

startCollecting();
