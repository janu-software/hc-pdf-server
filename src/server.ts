import { app } from './app'
import { SERVER_PORT, SERVER_ADDRESS } from './config'
import { FastifyListenOptions } from 'fastify/types/instance'
;(async () => {
  const server = await app()
  const options: FastifyListenOptions = {
    port: SERVER_PORT,
    host: SERVER_ADDRESS,
  }
  server.listen(options, (err, address) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    console.log(`Server listening at ${address}`)
  })
})()
