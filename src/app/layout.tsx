import type { Metadata } from "next";
import "./globals.css";
import { OceanMotionProvider } from "@/components/ocean-background";
export const metadata: Metadata = {
  title: {
    default: "Diverse DMV · Dare to dive",
    template: "%s · Diverse DMV",
  },
  description:
    "A professional community for underrepresented genders in tech across Washington, D.C., Maryland and Virginia.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <OceanMotionProvider>{children}</OceanMotionProvider>
      </body>
    </html>
  );
}
