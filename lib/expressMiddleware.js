'use strict';

var _require = require('zipkin'),
    Annotation = _require.Annotation,
    Header = _require.HttpHeaders,
    _require$option = _require.option,
    Some = _require$option.Some,
    None = _require$option.None,
    TraceId = _require.TraceId;

var url = require('url');

function containsRequiredHeaders(req) {
  return req.header(Header.TraceId) !== undefined && req.header(Header.SpanId) !== undefined;
}

function stringToBoolean(str) {
  return str === '1';
}

function stringToIntOption(str) {
  try {
    return new Some(parseInt(str));
  } catch (err) {
    return None;
  }
}

function formatRequestUrl(req) {
  var parsed = url.parse(req.originalUrl);
  return url.format({
    protocol: req.protocol,
    host: req.get('host'),
    pathname: parsed.pathname,
    search: parsed.search
  });
}

module.exports = function expressMiddleware(_ref) {
  var tracer = _ref.tracer,
      _ref$serviceName = _ref.serviceName,
      serviceName = _ref$serviceName === undefined ? 'unknown' : _ref$serviceName,
      _ref$port = _ref.port,
      port = _ref$port === undefined ? 0 : _ref$port;

  return async function zipkinExpressMiddleware(ctx, next) {
    var res = ctx.res;
    var req = ctx.req;
    req.originalUrl = ctx.originalUrl;
    await tracer.scoped(async function () {
      function readHeader(header) {
        var val = req.header(header);
        if (val != null) {
          return new Some(val);
        } else {
          return None;
        }
      }

      if (containsRequiredHeaders(req)) {
        var spanId = readHeader(Header.SpanId);
        spanId.ifPresent(function (sid) {
          var traceId = readHeader(Header.TraceId);
          var parentSpanId = readHeader(Header.ParentSpanId);
          var sampled = readHeader(Header.Sampled);
          var flags = readHeader(Header.Flags).flatMap(stringToIntOption).getOrElse(0);
          var id = new TraceId({
            traceId: traceId,
            parentId: parentSpanId,
            spanId: sid,
            sampled: sampled.map(stringToBoolean),
            flags: flags
          });
          tracer.setId(id);
        });
      } else {
        tracer.setId(tracer.createRootId());
        if (req.header(Header.Flags)) {
          var currentId = tracer.id;
          var idWithFlags = new TraceId({
            traceId: currentId.traceId,
            parentId: currentId.parentId,
            spanId: currentId.spanId,
            sampled: currentId.sampled,
            flags: readHeader(Header.Flags)
          });
          tracer.setId(idWithFlags);
        }
      }

      var id = tracer.id;

      tracer.recordServiceName(serviceName);
      tracer.recordRpc(req.method.toUpperCase());
      tracer.recordBinary('http.url', formatRequestUrl(req));
      tracer.recordAnnotation(new Annotation.ServerRecv());
      tracer.recordAnnotation(new Annotation.LocalAddr({ port: port }));

      if (id.flags !== 0 && id.flags != null) {
        tracer.recordBinary(Header.Flags, id.flags.toString());
      }

      res.on('finish', function () {
        tracer.scoped(function () {
          tracer.setId(id);
          tracer.recordBinary('http.status_code', res.statusCode.toString());
          tracer.recordAnnotation(new Annotation.ServerSend());
        });
      });

      await next();
    });
  };
};