const { Readable } = require('stream');
const graphMLGenerator = require('./createGraphML');

/** Class providing a graphML formatter. */
class GraphMLFormatter {
  /**
   * Create a graphML formatter.
   * @param {Object} network - a NC format network object.
   * @param {Object} codebook - the codebook for this network.
   * @param {Object} exportOptions - global export options object from FileExportManager.
   */
  constructor(network, codebook, exportOptions) {
    this.network = network;
    this.codebook = codebook;
    this.exportOptions = exportOptions;
  }

  writeToString() {
    const generator = graphMLGenerator(
      this.network,
      this.codebook,
      this.exportOptions,
    );

    const chunks = [];

    // Call the generator until it is done
    for (let { done, value } = generator.next(); !done; { done, value } = generator.next()) {
      chunks.push(value);
    }

    return chunks.join('');
  }

  /**
   * Write the file to a stream one chunk at a time.
   * @param {Stream} outStream
   */
  writeToStream(outStream) {
    const generator = graphMLGenerator(
      this.network,
      this.codebook,
      this.exportOptions,
    );

    const inStream = new Readable({
      read(/* size */) {
        const { done, value } = generator.next();
        if (done) {
          this.push(null);
        } else {
          this.push(value);
        }
      },
    });

    // TODO: handle teardown. Use pipeline() API in Node 10?
    inStream.pipe(outStream);

    return {
      abort: () => { inStream.destroy(); },
    };
  }
}

module.exports = GraphMLFormatter;
