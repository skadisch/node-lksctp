/* eslint-disable max-statements */

const assert = require("node:assert");
const socketpairFactory = require("./lib/socketpair.js");

describe("socket", function () {
  this.timeout(20000);

  describe("pair", () => {
    it("should create a pair of connected sockets correctly", async () => {
      await socketpairFactory.withSocketpair({
        test: ({ server, client }) => {
          server;
          client;
        }
      });
    });
  });

  describe("status", () => {
    it("should allow to retrieve stcp status", async () => {
      await socketpairFactory.withSocketpair({
        test: ({ server, client }) => {
          client;

          const status = server.status();

          // example:
          //
          // status: {
          //   tag: 82,
          //   state: 4,
          //   rwnd: 106496,
          //   unackdata: 0,
          //   penddata: 0,
          //   numberOfIncomingStreams: 10,
          //   numberOfOutgoingStreams: 10,
          //   fragmentationPoint: 65484,
          //   incomingQueue: 82,
          //   outgoingQueue: 3101425666,
          //   overallError: 16777343,
          //   maxBurst: 0,
          //   maxSeg: 0,
          //   peer: { tag: 1, rwnd: 0, cap: 7, sack: 0 }
          // }

          const isPositiveInteger = ({ value }) => {
            return !isNaN(value) && value >= 0;
          };

          assert(typeof status === "object");
          assert(isPositiveInteger({ value: status.tag }));
          assert(isPositiveInteger({ value: status.state }));
          assert(isPositiveInteger({ value: status.rwnd }));
          assert(isPositiveInteger({ value: status.unackdata }));
          assert(isPositiveInteger({ value: status.penddata }));
          assert(isPositiveInteger({ value: status.numberOfIncomingStreams }));
          assert(isPositiveInteger({ value: status.numberOfOutgoingStreams }));
          assert(isPositiveInteger({ value: status.fragmentationPoint }));
          assert(isPositiveInteger({ value: status.incomingQueue }));
          assert(isPositiveInteger({ value: status.outgoingQueue }));
          assert(isPositiveInteger({ value: status.overallError }));
          assert(isPositiveInteger({ value: status.maxBurst }));
          assert(isPositiveInteger({ value: status.maxSeg }));
          assert(typeof status.peer === "object");
          assert(isPositiveInteger({ value: status.peer.tag }));
          assert(isPositiveInteger({ value: status.peer.rwnd }));
          assert(isPositiveInteger({ value: status.peer.cap }));
          assert(isPositiveInteger({ value: status.peer.sack }));
        }
      });
    });
  });

  describe("MIS / OS", () => {
    describe("client", () => {

      [
        { OS: 1 },
        { OS: 2 },
        { OS: 5 },
        { OS: 10 },
        { OS: 20 },
        { OS: 50 },
        { OS: 200 }
      ].forEach(({ OS }) => {
        it(`should set and negotiate number of outgoing streams to ${OS} correctly`, async () => {
          await socketpairFactory.withSocketpair({
            options: {
              client: {
                OS
              },

              server: {
                socket: {
                  // always accept more than OS
                  MIS: OS + 10
                }
              }
            },

            test: ({ server, client }) => {
              const serverStatus = server.status();
              assert.strictEqual(serverStatus.numberOfIncomingStreams, OS);

              const clientStatus = client.status();
              assert.strictEqual(clientStatus.numberOfOutgoingStreams, OS);
            }
          });
        });
      });

      [
        { MIS: 1 },
        { MIS: 2 },
        { MIS: 5 },
        { MIS: 10 },
        { MIS: 20 },
      ].forEach(({ MIS }) => {
        it(`should limit and negotiate number of incoming streams to ${MIS} correctly`, async () => {
          await socketpairFactory.withSocketpair({
            options: {
              client: {
                MIS
              },

              server: {
                socket: {
                  // always request more than MIS
                  OS: MIS + 10
                }
              }
            },

            test: ({ server, client }) => {
              const serverStatus = server.status();
              assert.strictEqual(serverStatus.numberOfOutgoingStreams, MIS);

              const clientStatus = client.status();
              assert.strictEqual(clientStatus.numberOfIncomingStreams, MIS);
            }
          });
        });
      });

    });

    describe("server", () => {
      [
        { OS: 1 },
        { OS: 2 },
        { OS: 5 },
        { OS: 10 },
        { OS: 20 },
        { OS: 50 },
        { OS: 200 }
      ].forEach(({ OS }) => {
        it(`should set and negotiate number of outgoing streams to ${OS} correctly`, async () => {
          await socketpairFactory.withSocketpair({
            options: {
              client: {
                // always accept more than OS
                MIS: OS + 10
              },

              server: {
                socket: {
                  OS
                }
              }
            },

            test: ({ server, client }) => {
              const serverStatus = server.status();
              assert.strictEqual(serverStatus.numberOfOutgoingStreams, OS);

              const clientStatus = client.status();
              assert.strictEqual(clientStatus.numberOfIncomingStreams, OS);
            }
          });
        });
      });

      [
        { MIS: 1 },
        { MIS: 2 },
        { MIS: 5 },
        { MIS: 10 },
        { MIS: 20 },
      ].forEach(({ MIS }) => {
        it(`should limit and negotiate number of incoming streams to ${MIS} correctly`, async () => {
          await socketpairFactory.withSocketpair({
            options: {
              client: {
                // always request more than MIS
                OS: MIS + 10
              },

              server: {
                socket: {
                  MIS
                }
              }
            },

            test: ({ server, client }) => {
              const serverStatus = server.status();
              assert.strictEqual(serverStatus.numberOfIncomingStreams, MIS);

              const clientStatus = client.status();
              assert.strictEqual(clientStatus.numberOfOutgoingStreams, MIS);
            }
          });
        });
      });
    });
  });

  describe("send / receive", () => {
    const sendAndReceiveTest = ({ sender, receiver, packetToSend }) => {
      return new Promise((resolve, reject) => {
        let writeCallbackCalled = false;
        let endCallbackCalled = false;
        let packetCorrectlyReceived = false;

        const maybeResolve = () => {
          if (!writeCallbackCalled) {
            return;
          }

          if (!endCallbackCalled) {
            return;
          }

          if (!packetCorrectlyReceived) {
            return;
          }

          resolve();
        };

        sender.write(packetToSend, (writeError) => {
          if (writeError) {
            reject(writeError);
          }

          writeCallbackCalled = true;
          maybeResolve();
        });

        sender.end(() => {
          endCallbackCalled = true;
          maybeResolve();
        });

        sender.on("error", (err) => {
          reject(err);
        });

        receiver.on("data", (packetReceived) => {
          try {
            assert.deepEqual(packetReceived, packetToSend);
          } catch (ex) {
            reject(ex);
          }

          packetCorrectlyReceived = true;
          maybeResolve();
        });

        receiver.on("error", (err) => {
          reject(err);
        });
      });
    };

    [
      { packetSize: 1 },
      { packetSize: 5 },
      { packetSize: 10 },
      { packetSize: 100 },
      { packetSize: 2000 },
      { packetSize: 30000 }
    ].forEach(({ packetSize }) => {
      it(`should send packets (${packetSize} bytes) from client to server correctly`, async () => {
        await socketpairFactory.withSocketpair({
          test: async ({ server, client }) => {

            const packetToSend = Buffer.alloc(packetSize);
            for (let i = 0; i < packetSize; i += 1) {
              packetToSend[i] = i % 256;
            }

            await sendAndReceiveTest({
              sender: client,
              receiver: server,
              packetToSend
            });
          }
        });
      });

      it(`should send packets (${packetSize} bytes) from server to client correctly`, async () => {
        await socketpairFactory.withSocketpair({
          test: async ({ server, client }) => {

            const packetToSend = Buffer.alloc(packetSize);
            for (let i = 0; i < packetSize; i += 1) {
              packetToSend[i] = i % 256;
            }

            await sendAndReceiveTest({
              sender: server,
              receiver: client,
              packetToSend
            });
          }
        });
      });
    });
  });
});
