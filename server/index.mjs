import '../scripts/environment.mjs';
import { createApplication } from './app.mjs';
const app=createApplication();
const port=Number(process.env.PORT||3001),host=process.env.HOST||'127.0.0.1';
app.server.listen(port,host,()=>console.log(`JanaMen: http://${host}:${port}`));
app.server.on('error',error=>{console.error(error.message);app.close();process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.server.close(()=>{app.close();process.exit(0);}));
