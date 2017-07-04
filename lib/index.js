'use strict';

var expressMiddleware = require('./expressMiddleware');
var wrapExpressHttpProxy = require('./wrapExpressHttpProxy');

module.exports = {
  expressMiddleware: expressMiddleware,
  wrapExpressHttpProxy: wrapExpressHttpProxy
};