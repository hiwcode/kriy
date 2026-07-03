import type { Metadata } from "next";
import "./globals.css";
import { Poppins } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/components/auth/auth-provider";
import { BackendHealthProvider } from "@/components/backend-health-provider";
import { Toaster } from "@/components/ui/sonner";
import { themeInitScript } from "@/config/theme";

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
});


export const metadata: Metadata = {
  title: "Atelier",
  description: "Your AI Workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${poppins.className} antialiased`}
      >
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
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
