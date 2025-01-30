import pino from 'pino';
import pretty from 'pino-pretty';

// Create a pretty-print stream
const prettyStream = pretty({
  colorize: true,
  translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
  ignore: "pid,hostname",
});

// Pass the stream directly to Pino
export const logger = pino(prettyStream);