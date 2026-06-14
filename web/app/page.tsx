import { redirect } from "next/navigation";

// The marketing + app UI is the static site served from /public (index.html →
// app.html → safety.html), wired to the Hub APIs (same origin). Send the root there.
export default function Home() {
  redirect("/index.html");
}
