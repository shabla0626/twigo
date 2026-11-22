"use client";

import { io, type Socket } from "socket.io-client";

// One shared connection per browser tab. Authentication uses the HttpOnly
// session cookie, which the browser sends with the same-origin handshake.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io", withCredentials: true, transports: ["websocket", "polling"], reconnectionDelayMax: 10_000 });
    // The server closes the connection when this session was signed out (here or on
    // another device). Go to the sign-in page instead of silently showing "offline".
    socket.on("session:ended", () => {
      socket?.close();
      window.location.assign("/login?signedout=1");
    });
  }
  return socket;
}
