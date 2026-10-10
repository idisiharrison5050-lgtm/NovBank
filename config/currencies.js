var https = require('https');

var currencies = [
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA' },
  { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' }
];

var lastSuccessfulRefresh = 0;
var refreshInProgress = null;
var CACHE_TTL = 24 * 60 * 60 * 1000;

// Pull active currency codes, names and symbols from the public REST Countries API.
// This catalog is for account preferences only; it does not provide FX conversion.
function refreshCurrencies() {
  if (Date.now() - lastSuccessfulRefresh < CACHE_TTL) return Promise.resolve(currencies);
  if (refreshInProgress) return refreshInProgress;

  refreshInProgress = new Promise(function (resolve, reject) {
    var request = https.get('https://restcountries.com/v3.1/all?fields=currencies', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'NovBank-currency-catalog' },
      timeout: 8000
    }, function (response) {
      var body = '';
      response.setEncoding('utf8');
      response.on('data', function (chunk) { body += chunk; });
      response.on('end', function () {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error('Currency catalog returned HTTP ' + response.statusCode));
        }

        try {
          var countries = JSON.parse(body);
          var byCode = {};
          countries.forEach(function (country) {
            var entries = country && country.currencies ? country.currencies : {};
            Object.keys(entries).forEach(function (code) {
              var item = entries[code] || {};
              if (!/^[A-Z]{3}$/.test(code) || !item.name) return;
              if (!byCode[code]) {
                byCode[code] = {
                  code: code,
                  name: String(item.name),
                  symbol: item.symbol ? String(item.symbol) : code
                };
              } else if (byCode[code].symbol === code && item.symbol) {
                byCode[code].symbol = String(item.symbol);
              }
            });
          });

          var fetched = Object.keys(byCode).map(function (code) { return byCode[code]; });
          if (fetched.length < 100) throw new Error('Currency catalog response was incomplete');

          fetched.sort(function (a, b) {
            return a.code.localeCompare(b.code);
          });

          // Keep the same array object so existing route imports see the refreshed data.
          currencies.splice.apply(currencies, [0, currencies.length].concat(fetched));
          lastSuccessfulRefresh = Date.now();
          resolve(currencies);
        } catch (err) {
          reject(err);
        }
      });
    });

    request.on('timeout', function () { request.destroy(new Error('Currency catalog request timed out')); });
    request.on('error', reject);
  }).catch(function (err) {
    console.error('Could not refresh NovBank currency catalog; using cached list:', err.message);
    return currencies;
  }).then(function (result) {
    refreshInProgress = null;
    return result;
  });

  return refreshInProgress;
}

currencies.refresh = refreshCurrencies;
currencies.getLastRefreshed = function () { return lastSuccessfulRefresh; };

module.exports = currencies;
