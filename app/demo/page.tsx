import { permanentRedirect } from "next/navigation";
// Eski tanıtım adresi: kalıcı olarak ana sayfaya yönlenir.
export default function DemoPage() { permanentRedirect("/"); }
