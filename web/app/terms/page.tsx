import type { Metadata } from "next";
import { LegalShell, LegalSection } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service — KRIY",
  description: "The terms for using this KRIY demo instance.",
};

const CONTACT = "contract@gethowitworks.com";

export default function TermsPage() {
  return (
    <LegalShell eyebrow="Legal" title="Terms of Service" updated="July 3, 2026">
      <p className="text-sm leading-relaxed text-muted-foreground">
        These terms govern your use of this KRIY instance, operated by{" "}
        <strong>hiwcode</strong> (&quot;we&quot;, &quot;us&quot;). By signing in
        or using the service, you agree to them. If you don&apos;t agree, please don&apos;t use
        it.
      </p>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Demo notice.</strong> This is a demonstration
        service provided free of charge and &quot;as is&quot;. It may change, break, or go
        offline at any time, with no guarantee of availability or data retention.
      </div>

      <LegalSection title="What KRIY is">
        <p>
          KRIY is a source-available platform for building and running
          AI agents. This instance is provided for demonstration and evaluation.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          You sign in with Google. You&apos;re responsible for activity under your account
          and for keeping any API keys or credentials you add secure. Don&apos;t share your
          access with others.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>use the service for anything illegal or harmful;</li>
          <li>attempt to break, overload, or gain unauthorized access to the service or others&apos; data;</li>
          <li>violate the terms of any third-party provider you connect (e.g. AI providers); or</li>
          <li>submit content you don&apos;t have the right to use.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You keep ownership of the content you create. You grant us the limited
          permission needed to store and process it in order to operate the service.
          You&apos;re responsible for what you submit — don&apos;t upload other people&apos;s
          confidential or personal data without permission.
        </p>
      </LegalSection>

      <LegalSection title="Third-party services & costs">
        <p>
          KRIY connects to services you configure (AI providers, MCP servers, email,
          etc.). You supply your own keys and are responsible for their usage, costs,
          and terms. We&apos;re not responsible for third-party services or their output.
        </p>
      </LegalSection>

      <LegalSection title="AI output">
        <p>
          AI-generated output can be inaccurate, incomplete, or offensive. Don&apos;t rely
          on it for professional, legal, medical, or financial decisions. You&apos;re
          responsible for how you use any output.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          The service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of
          any kind, express or implied, including fitness for a particular purpose and
          non-infringement.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, we are not liable for any indirect,
          incidental, or consequential damages, or for any loss of data, arising from
          your use of the service.
        </p>
      </LegalSection>

      <LegalSection title="Termination">
        <p>
          You may stop using the service at any time and request deletion of your data.
          We may suspend or discontinue the service, or any account, at any time —
          especially as this is a demo.
        </p>
      </LegalSection>

      <LegalSection title="The software license">
        <p>
          The KRIY source code is licensed under the Functional Source License
          (FSL-1.1-MIT). These Terms cover your use of <em>this hosted instance</em>;
          the code license covers using the software itself.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may update them; continued use after changes means you accept them. Questions:{" "}
          <a href={`mailto:${CONTACT}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {CONTACT}
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
