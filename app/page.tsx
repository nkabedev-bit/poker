import { redirect } from "next/navigation";

// The club's address is for players: the bare domain opens the club app. Admins come in
// through the admin bot (/tma) or the web panel (/admin, signing in at /login).
export default function Home() {
  redirect("/client");
}
