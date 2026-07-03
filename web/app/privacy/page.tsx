import type { Metadata } from "next";
import { LegalShell, LegalSection } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy — Atelier",
  description: "How Atelier handles your data.",
};

const CONTACT = "contract@gethowitworks.com";

export default function PrivacyPage() {
  return (
    <LegalShell eyebrow="Legal" title="Privacy Policy" updated="July 3, 2026">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Atelier is an open-source, source-available AI workspace. This instance is
        operated by <strong>hiwcode</strong> (&quot;we&quot;, &quot;us&quot;) as a
        demo project. This policy explains, in plain language, what data
        we handle and why. Questions:{" "}
        <a href={`mailto:${CONTACT}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {CONTACT}
        </a>
        .
      </p>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Demo notice.</strong> This is a demonstration
        service provided as-is. Please don&apos;t store sensitive, confidential, or
        production data here.
      </div>

      <LegalSection title="What we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Account info</strong> from Google Sign-In — your name, email
            address, and profile picture.
          </li>
          <li>
            <strong>Content you create</strong> — agents, prompts, chat messages,
            uploaded files, skills, and extracted memory/facts.
          </li>
          <li>
            <strong>Credentials you add</strong> — e.g. AI-provider API keys, MCP
            connection details, and email app passwords. These are stored encrypted.
          </li>
          <li>
            <strong>Basic technical data</strong> needed to run the service (e.g.
            server logs).
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use it">
        <p>
          We use your data only to provide the app&apos;s features — authenticating you,
          storing your workspace, and running the agents you build. We do{" "}
          <strong>not</strong> sell your data, use it for advertising, or use your
          content to train our own models.
        </p>
      </LegalSection>

      <LegalSection title="Third parties your data is shared with">
        <p>
          To make the product work, some data is sent to services you choose to use:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>AI providers</strong> — prompts and content you submit are sent to
            the model providers you configure (e.g. Google Gemini, OpenAI, Anthropic)
            to generate responses.
          </li>
          <li>
            <strong>Tools you connect</strong> — MCP servers, databases, or other
            integrations you set up receive the data you direct to them.
          </li>
          <li>
            <strong>Email</strong> — if you use the email feature, messages are sent
            through your configured Gmail account.
          </li>
          <li>
            <strong>Google</strong> — for sign-in and identity.
          </li>
        </ul>
        <p>
          These providers process data under their own privacy policies and terms.
        </p>
      </LegalSection>

      <LegalSection title="How your data is protected">
        <p>
          Sensitive credentials (API keys, tokens, email passwords, connection
          strings) are encrypted at rest, and API keys, sessions, and invite links are
          stored as one-way hashes. Access is scoped to your account and workspace. No
          system is perfectly secure, but we take reasonable measures.
        </p>
      </LegalSection>

      <LegalSection title="Retention & deletion">
        <p>
          We keep your data while your account exists. You can request deletion of your
          account and associated data at any time by emailing{" "}
          <a href={`mailto:${CONTACT}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {CONTACT}
          </a>
          . If you self-host Atelier, you control your own database and retention.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          Depending on where you live (e.g. under GDPR or CCPA/CPRA), you may have the
          right to access, correct, export, or delete your personal data. Contact us to
          exercise these rights.
        </p>
      </LegalSection>

      <LegalSection title="Cookies & local storage">
        <p>
          We store a login session token and your preferences (such as theme and accent
          color) in your browser. We don&apos;t use third-party advertising or tracking
          cookies.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          Atelier is not intended for anyone under the age required to consent to data
          processing in their country (typically 13, or 16 in parts of the EU).
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may update this policy from time to time. Material changes will be
          reflected by the &quot;last updated&quot; date above.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about privacy? Email{" "}
          <a href={`mailto:${CONTACT}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {CONTACT}
          </a>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
