import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import router from "./routes";
import { notFound, errorHandler } from "./middlewares/error-handler";
import { logger } from "./lib/logger";

const app: Express = express();

// Atrás do proxy do Replit (ou de qualquer reverse proxy): sem isto `req.ip`
// seria o IP do proxy, e o rate limit do login valeria para todo mundo junto.
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    // Id por requisição que sobrevive a várias instâncias: respeita o
    // X-Request-Id de quem chamou (o proxy, um teste) e devolve no cabeçalho.
    genReqId(req, res) {
      const recebido = req.headers["x-request-id"];
      const id =
        typeof recebido === "string" && /^[\w.-]{8,64}$/.test(recebido) ? recebido : randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Cabeçalhos de segurança. A API só responde JSON, então a CSP restritiva não
// atrapalha nada; `frame-ancestors 'none'` barra clickjacking em qualquer
// resposta que um navegador venha a renderizar (o download de um protocolo,
// por exemplo).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-origin" },
    // HSTS só faz sentido atrás de HTTPS; o proxy do deploy é sempre HTTPS.
    strictTransportSecurity: process.env.NODE_ENV === "production" ? { maxAge: 15552000 } : false,
  }),
);

// Sem `cors()`: front e API vivem na mesma origem (`/api`), e liberar `*`
// só facilitava força bruta no login a partir de qualquer site.
// Sem `express.urlencoded`: a API só fala JSON, e um formulário HTML de fora
// não pode conseguir fazer login em nome de ninguém (login CSRF).
app.use(cookieParser());
app.use(express.json({ limit: "256kb" }));

app.use("/api", router);

app.use(notFound);
app.use(errorHandler);

export default app;
