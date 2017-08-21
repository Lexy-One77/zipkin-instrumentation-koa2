# zipkin-instrumentation-koa2

koa2 middleware and instrumentation that adds Zipkin tracing to the application.

## koa2 Middleware

```javascript
const koa = require('koa');
const {Tracer, ExplicitContext, ConsoleRecorder} = require('zipkin');
const zipkinMiddleware = require('zipkin-instrumentation-koa2').expressMiddleware;

const ctxImpl = new ExplicitContext();
const recorder = new ConsoleRecorder();

const tracer = new Tracer({ctxImpl, recorder}); // configure your tracer properly here

const app = new koa();

//add this code first
//模拟express框架自定义get、header属性，兼容koa2框架
app.use(async function (ctx, next) {
    ctx.req.get = ctx.req.header = (name)=> {
        if (!name)
            throw new TypeError('name argument is required to ctx.req.header');
        if (typeof name !== 'string')
            throw new TypeError('name must be a string to ctx.req.header');
        let lc = name.toLowerCase();
        switch (lc) {
            case 'referer':
            case 'referrer':
                return ctx.req.headers.referrer
                    || ctx.req.headers.referer;
            default:
                return ctx.req.headers[lc];
        }
    }
    await next()
});

// Add the Zipkin middleware
app.use(zipkinMiddleware({
  tracer,
  serviceName: 'service-a' // name of this application
}));
```