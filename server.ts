import { MediaStreamTrack, RTCPeerConnection } from "werift";
import { Server } from "ws";
import { createSocket } from "dgram";
import { exec } from "child_process";

console.log("start");

const server = new Server({ port: 8888 });
const udp = createSocket("udp4");
udp.bind(5000);

const child = exec(
  "gst-launch-1.0 -v -e v4l2src device=/dev/video0 ! video/x-raw,width=640,height=480 ! vp8enc error-resilient=partitions keyframe-max-dist=10 auto-alt-ref=true cpu-used=5 deadline=1 ! rtpvp8pay ! udpsink host=127.0.0.1 port=5000"
);

server.on("connection", async (socket) => {
  const pc = new RTCPeerConnection();

  const track = new MediaStreamTrack({ kind: "video" });
  pc.addTrack(track);

  pc.connectionStateChange
    .watch((state) => state === "connected")
    .then(() => {
      udp.on("message", (data) => {
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
