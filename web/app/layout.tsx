import type { Metadata } from "next";
import "@fontsource-variable/onest/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/components/auth/auth-provider";
import { BackendHealthProvider } from "@/components/backend-health-provider";
import { Toaster } from "@/components/ui/sonner";
import { themeInitScript } from "@/config/theme";
import { GoogleAnalytics } from "@next/third-parties/google";

export const metadata: Metadata = {
  title: "KRIY",
  description: "Put governed AI agents behind the product you already run.",
};

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {/* Apply saved accent + contrast before paint (no theme flash on load). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <BackendHealthProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </BackendHealthProvider>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
      {GA_ID && <GoogleAnalytics gaId={GA_ID} />}
    </html>
  );
}
