'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _require = require('zipkin'),
    Request = _require.Request,
    Annotation = _require.Annotation;

var url = require('url');

function formatRequestUrl(proxyReq) {
  // Protocol is not available in proxyReq by express-http-proxy
  var parsedPath = url.parse(proxyReq.path);
  return url.format({
    hostname: proxyReq.hostname,
    port: proxyReq.port,
    pathname: parsedPath.pathname,
    search: parsedPath.search,
    slashes: true // https://github.com/nodejs/node/issues/11103
  });
}

var ExpressHttpProxyInstrumentation = function () {
  function ExpressHttpProxyInstrumentation(_ref) {
    var tracer = _ref.tracer,
        serviceName = _ref.serviceName,
        remoteServiceName = _ref.remoteServiceName;

    _classCallCheck(this, ExpressHttpProxyInstrumentation);

    this.tracer = tracer;
    this.serviceName = serviceName;
    this.remoteServiceName = remoteServiceName;
  }

  _createClass(ExpressHttpProxyInstrumentation, [{
    key: 'decorateAndRecordRequest',
    value: function decorateAndRecordRequest(proxyReq, originalReq) {
      var _this = this;

      return this.tracer.scoped(function () {
        _this.tracer.setId(_this.tracer.createChildId());
        var traceId = _this.tracer.id;

        // for use later when recording response
        var originalReqWithTrace = originalReq;
        originalReqWithTrace.traceId = traceId;

        var proxyReqWithZipkinHeaders = Request.addZipkinHeaders(proxyReq, traceId);
        _this._recordRequest(proxyReqWithZipkinHeaders);
        return proxyReqWithZipkinHeaders;
      });
    }
  }, {
    key: '_recordRequest',
    value: function _recordRequest(proxyReq) {
      this.tracer.recordServiceName(this.serviceName);
      this.tracer.recordRpc(proxyReq.method.toUpperCase());
      this.tracer.recordBinary('http.url', formatRequestUrl(proxyReq));
      this.tracer.recordAnnotation(new Annotation.ClientSend());
      if (this.remoteServiceName) {
        this.tracer.recordAnnotation(new Annotation.ServerAddr({
          serviceName: this.remoteServiceName,
          port: proxyReq.port
        }));
      }
    }
  }, {
    key: 'recordResponse',
    value: function recordResponse(rsp, originalReq) {
      var _this2 = this;

      this.tracer.scoped(function () {
        _this2.tracer.setId(originalReq.traceId);
        _this2.tracer.recordBinary('http.status_code', rsp.statusCode.toString());
        _this2.tracer.recordAnnotation(new Annotation.ClientRecv());
      });
    }
  }]);

  return ExpressHttpProxyInstrumentation;
}();

function wrapProxy(proxy, _ref2) {
  var tracer = _ref2.tracer,
      _ref2$serviceName = _ref2.serviceName,
      serviceName = _ref2$serviceName === undefined ? 'unknown' : _ref2$serviceName,
      remoteServiceName = _ref2.remoteServiceName;

  return function zipkinProxy(host) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    function wrapDecorateRequest(instrumentation, originalDecorateRequest) {
      return function (proxyReq, originalReq) {
        var wrappedProxyReq = proxyReq;

        if (typeof originalDecorateRequest === 'function') {
          wrappedProxyReq = originalDecorateRequest(proxyReq, originalReq);
        }

        return instrumentation.decorateAndRecordRequest(wrappedProxyReq, originalReq);
      };
    }

    function wrapIntercept(instrumentation, originalIntercept) {
      return function (rsp, data, originalReq, res, callback) {
        var instrumentedCallback = function instrumentedCallback(err, rspd, sent) {
          instrumentation.recordResponse(rsp, originalReq);
          return callback(err, rspd, sent);
        };

        if (typeof originalIntercept === 'function') {
          originalIntercept(rsp, data, originalReq, res, instrumentedCallback);
        } else {
          instrumentedCallback(null, data);
        }
      };
    }

    var instrumentation = new ExpressHttpProxyInstrumentation({
      tracer: tracer,
      serviceName: serviceName,
      remoteServiceName: remoteServiceName
    });

    var wrappedOptions = options;

    var originalDecorateRequest = wrappedOptions.decorateRequest;
    wrappedOptions.decorateRequest = wrapDecorateRequest(instrumentation, originalDecorateRequest);

    var originalIntercept = wrappedOptions.intercept;
    wrappedOptions.intercept = wrapIntercept(instrumentation, originalIntercept);

    return proxy(host, wrappedOptions);
  };
}

module.exports = wrapProxy;