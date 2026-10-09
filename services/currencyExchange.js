var https = require('https');

var CACHE_TTL = 60 * 60 * 1000;
var cachedRates = null;
var cachedAt = 0;
var requestInProgress = null;

// Open Exchange Rates data from the public open.er-api.com endpoint.
// The API publishes rates against EUR; cross-rates are calculated from that base.
function getRates() {
  if (cachedRates && Date.now() - cachedAt < CACHE_TTL) return Promise.resolve(cachedRates);
  if (requestInProgress) return requestInProgress;

  requestInProgress = new Promise(function (resolve, reject) {
    var request = https.get('https://open.er-api.com/v6/latest/EUR', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'NovBank-currency-converter' },
      timeout: 8000
    }, function (response) {
      var body = '';
      response.setEncoding('utf8');
      response.on('data', function (chunk) { body += chunk; });
      response.on('end', function () {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error('Exchange-rate provider returned HTTP ' + response.statusCode));
        }
        try {
          var payload = JSON.parse(body);
          if (payload.result !== 'success' || !payload.rates || !payload.rates.EUR) {
            throw new Error('Exchange-rate provider returned invalid data');
          }
          cachedRates = payload.rates;
          cachedAt = Date.now();
          resolve({ rates: cachedRates, updatedAt: payload.time_last_update_utc || new Date().toISOString() });
        } catch (err) {
          reject(err);
        }
      });
    });
    request.on('timeout', function () { request.destroy(new Error('Exchange-rate request timed out')); });
    request.on('error', reject);
  }).catch(function (err) {
    if (cachedRates) return { rates: cachedRates, updatedAt: new Date(cachedAt).toISOString(), stale: true };
    throw err;
  }).then(function (result) {
    requestInProgress = null;
    return result;
  }, function (err) {
    requestInProgress = null;
    throw err;
  });

  return requestInProgress;
}

function getRate(fromCurrency, toCurrency) {
  var from = String(fromCurrency || '').toUpperCase();
  var to = String(toCurrency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    return Promise.reject(new Error('Choose valid three-letter currency codes.'));
  }
  return getRates().then(function (data) {
    var fromRate = Number(data.rates[from]);
    var toRate = Number(data.rates[to]);
    if (!isFinite(fromRate) || fromRate <= 0 || !isFinite(toRate) || toRate <= 0) {
      throw new Error('A live exchange rate is not available for this currency pair.');
    }
    return {
      from: from,
      to: to,
      rate: toRate / fromRate,
      provider: 'open.er-api.com',
      updatedAt: data.updatedAt,
      stale: Boolean(data.stale)
    };
  });
}

module.exports = { getRate: getRate };
