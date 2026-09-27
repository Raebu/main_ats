import type { Metadata } from "next";
import "@/app/globals.css";
import Header from "@/components/Header";
import AttributionCapture from "@/components/AttributionCapture";

export const metadata: Metadata = {
  title: { default: "Raeburn Talent", template: "%s | Raeburn Talent" },
  description: "Careers and opportunities across The Raeburn Group."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AttributionCapture /><Header />{children}</body></html>;
}
