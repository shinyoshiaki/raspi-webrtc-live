import {
  MediaStreamTrack,
  RTCPeerConnection,
  RTCRtpCodecParameters,
  RtpPacket,
} from "werift";
import { Server } from "ws";
import { createSocket } from "dgram";
import { exec } from "child_process";

console.log("start");

const server = new Server({ port: 8888 });
const udp = createSocket("udp4");
udp.bind(5000);

const child = exec(
  "gst-launch-1.0 -v v4l2src device=/dev/video0 ! video/x-raw,format=I420,width=640,height=480,framerate=15/1 ! omxh264enc ! h264parse ! video/x-h264 ! rtph264pay config-interval=1 ! udpsink host=127.0.0.1 port=5000"
);

server.on("connection", async (socket) => {
  const pc = new RTCPeerConnection({
    codecs: {
      video: [
        new RTCRtpCodecParameters({
          mimeType: "video/H264",
          clockRate: 90000,
          rtcpFeedback: [
            { type: "ccm", parameter: "fir" },
            { type: "nack" },
            { type: "nack", parameter: "pli" },
            { type: "goog-remb" },
          ],
        }),
      ],
    },
  });

  const track = new MediaStreamTrack({ kind: "video" });
  pc.addTrack(track);

  pc.connectionStateChange
    .watch((state) => state === "connected")
    .then(() => {
      udp.on("message", (data) => {
        const packet = RtpPacket.deSerialize(data);
        console.log(packet.header, packet.payload);
        track.writeRtp(data);
      });
    });

  await pc.setLocalDescription(await pc.createOffer());
  const sdp = JSON.stringify(pc.localDescription);
  socket.send(sdp);

  socket.on("message", (data: any) => {
    const msg = JSON.parse(data);
    if (msg.sdp) {
      pc.setRemoteDescription(msg);
    } else if (msg.candidate) {
      pc.addIceCandidate(msg);
    }
  });
});

process.on("exit", () => {
  process.kill(child.pid + 1);
});
process.on("SIGINT", () => {
  process.exit(0);
});
