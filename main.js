// give bin path to downloaded Chromium
const fs = require( 'fs' )
const path = require( 'path' )
const binPath = fs.readFileSync( path.join( __dirname, 'bin-path.txt' ), 'utf8' )
module.exports = binPath