"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { PageLayout } from "@/components/ui/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getUserConfig,
  updateUserConfig,
  getApiKeyInfo,
  generateApiKey,
  revokeApiKey,
  type UserConfig,
  type ApiKeyInfo,
} from "@/lib/api/user-config";
import { listAgents, type AgentItem } from "@/lib/api/agents";
import { cn } from "@/lib/utils";
import {
  Key,
  Save,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Sparkles,
  Eye,
  EyeOff,
  ChevronRight,
  AlertTriangle,
  type LucideIcon,
  SlackIcon,
  Palette,
  Mail,
  Info
} from "lucide-react";
import { AccentPicker } from "@/components/accent-picker";
import { ContrastToggle } from "@/components/contrast-toggle";

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-thinking-exp",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "o3-mini",
  "claude-sonnet-4-20250514",
  "claude-haiku-4-20250414",
];

/* ------------------------------------------------------------------ */
/*  Shared payload type                                                */
/* ------------------------------------------------------------------ */

type ConfigPayload = Parameters<typeof updateUserConfig>[0];

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function OpikLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="40 40 230 230" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M211.526 86.214C163.671 65.177 106.858 87.6512 84.9987 137.376C63.1395 187.101 84.9915 244.157 132.846 265.194C152.148 273.679 172.796 275.093 192.066 270.531C200.361 268.567 208.678 273.7 210.641 281.995C212.605 290.29 207.473 298.607 199.177 300.571C173.657 306.612 146.128 304.754 120.423 293.454C56.3654 265.294 28.2831 189.683 56.7387 124.953C85.1944 60.2225 159.892 29.7942 223.949 57.954C263.032 75.1349 288.768 110.083 296.374 149.317C297.997 157.686 292.528 165.785 284.159 167.408C275.791 169.03 267.691 163.561 266.069 155.192C260.271 125.29 240.78 99.074 211.526 86.214ZM263.453 256.783C266.44 269.313 258.703 281.891 246.173 284.878C233.643 287.864 221.064 280.128 218.078 267.598C215.091 255.068 222.828 242.489 235.358 239.503C247.888 236.516 260.467 244.253 263.453 256.783ZM282.895 238.991C299.635 235.001 309.971 218.196 305.981 201.457C301.991 184.717 285.186 174.381 268.447 178.371C251.707 182.361 241.371 199.165 245.361 215.905C249.351 232.645 266.156 242.981 282.895 238.991Z" fill="url(#opik_cfg_gradient)" />
      <defs>
        <linearGradient id="opik_cfg_gradient" x1="258.131" y1="269.783" x2="88.6452" y2="75.4571" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FB9341" />
          <stop offset="1" stopColor="#E30D3E" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Placeholder value shown in a secret field that's already saved. The real
 *  secret is never sent to the client; leaving this untouched keeps it. */
const SECRET_MASK = "••••••••••••";

/** Password input with a show/hide toggle. */
function SecretInput({
  value,
  onChange,
  placeholder,
  id,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="pr-10 font-mono"
        autoComplete="off"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        disabled={disabled}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        aria-label={show ? "Hide value" : "Show value"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** A clickable settings row that opens an editor. */
function SettingRow({
  icon,
  iconNode,
  iconClassName,
  title,
  description,
  status,
  onClick,
  actionLabel = "Configure",
}: {
  icon?: LucideIcon;
  iconNode?: React.ReactNode;
  iconClassName?: string;
  title: string;
  description: string;
  status?: React.ReactNode;
  onClick: () => void;
  actionLabel?: string;
}) {
  const Icon = icon;
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary",
          iconClassName
        )}
      >
        {iconNode ?? (Icon ? <Icon className="size-5" /> : null)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{title}</p>
          {status}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{description}</p>
      </div>
      <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        <span className="hidden sm:inline">{actionLabel}</span>
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function FieldLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}

function StatusBadge({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel: string; inactiveLabel: string }) {
  return active ? (
    <Badge className="gap-1 border-0 bg-success/12 text-success">
      <span className="size-1.5 rounded-full bg-success" />
      {activeLabel}
    </Badge>
  ) : (
    <Badge variant="secondary" className="border-0 bg-muted text-muted-foreground">
      {inactiveLabel}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ConfigPage() {
  const auth = useAuth();
  const [config, setConfig] = React.useState<UserConfig | null>(null);
  const [apiKeyInfo, setApiKeyInfo] = React.useState<ApiKeyInfo | null>(null);
  const [agents, setAgents] = React.useState<AgentItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // which dialog is open
  const [openDialog, setOpenDialog] = React.useState<null | "providers" | "apikey" | "opik" | "slack" | "gmail">(null);

  // API key flow
  const [newApiKey, setNewApiKey] = React.useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const loadConfig = React.useCallback(async () => {
    const [c, k, agentsResult] = await Promise.all([
      getUserConfig(),
      getApiKeyInfo().catch(() => ({ key_prefix: null, created_at: null })),
      listAgents({ limit: 200, offset: 0 }).catch(() => ({ items: [], pagination: {} })),
    ]);
    setConfig(c);
    setApiKeyInfo(k);
    setAgents(agentsResult.items ?? []);
  }, []);

  React.useEffect(() => {
    loadConfig()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [loadConfig]);

  /** Persist a partial patch on top of the current server config. */
  const saveConfig = React.useCallback(
    async (patch: ConfigPayload): Promise<boolean> => {
      if (!config) return false;
      setSaving(true);
      setError(null);
      try {
        // Send only the changed fields. The backend leaves any field we omit
        // unchanged, so we must NOT resend the whole config — secrets are no
        // longer returned to the client (write-only), so a full resend would
        // wipe every secret we can't see.
        const updated = await updateUserConfig(patch);
        setConfig(updated);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to save";
        setError(msg);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [config]
  );

  const handleCopyApiKey = React.useCallback(async () => {
    if (!newApiKey) return;
    await navigator.clipboard.writeText(newApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [newApiKey]);

  const handleGenerateApiKey = async () => {
    setApiKeyLoading(true);
    setError(null);
    setNewApiKey(null);
    try {
      const { api_key } = await generateApiKey();
      setNewApiKey(api_key);
      await loadConfig();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate API key");
    } finally {
      setApiKeyLoading(false);
    }
  };

  const handleRevokeApiKey = async () => {
    if (!confirm("Revoke your API key? Any integrations using it will stop working.")) return;
    setApiKeyLoading(true);
    setError(null);
    setNewApiKey(null);
    try {
      await revokeApiKey();
      await loadConfig();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke API key");
    } finally {
      setApiKeyLoading(false);
    }
  };

  /* ----- derived state ----- */
  const providerCount = config
    ? [config.google_api_key_set, config.openai_api_key_set, config.anthropic_api_key_set].filter(Boolean).length
    : 0;

  if (loading) {
    return (
      <AppLayout>
        <PageLayout title="Config" subtitle="Manage your account and settings">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="h-28 animate-pulse rounded-xl border bg-card" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border bg-card" />
            ))}
          </div>
        </PageLayout>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageLayout title="Config" subtitle="Manage your account and integration settings">
        <div className="mx-auto max-w-3xl animate-fade-in-up space-y-8">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Account banner */}
          <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center gap-4 p-4">
              <Avatar size="lg" className="size-20 ">
                <AvatarImage src={auth?.user?.picture} alt={auth?.user?.name} />
                <AvatarFallback className="text-xl">
                  {auth?.user?.name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold tracking-tight">{auth?.user?.name}</p>
                <p className="truncate text-sm text-muted-foreground">{auth?.user?.email}</p>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <section className="space-y-3">
            <div className="px-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Appearance
              </h2>
            </div>
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Palette className="size-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Accent color</p>
                  <p className="text-xs text-muted-foreground">
                    Personalize the theme. Green is the default; pick any color and it
                    applies everywhere instantly.
                  </p>
                </div>
              </div>
              <AccentPicker className="mt-4" />
              <div className="mt-4 border-t pt-4">
                <ContrastToggle />
              </div>
            </div>
          </section>

          {/* AI & Models */}
          <section className="space-y-3">
            <div className="px-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                AI & Models
              </h2>
            </div>
            <SettingRow
              icon={Sparkles}
              title="AI Providers"
              description={
                providerCount > 0
                  ? `${providerCount} provider${providerCount > 1 ? "s" : ""} connected · Default: ${config?.default_model}`
                  : "Add provider keys to start using models"
              }
              status={
                <StatusBadge
                  active={providerCount > 0}
                  activeLabel={`${providerCount} connected`}
                  inactiveLabel="Not configured"
                />
              }
              onClick={() => setOpenDialog("providers")}
            />
          </section>

          {/* Integrations */}
          <section className="space-y-3">
            <div className="px-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Integrations
              </h2>
            </div>

            <SettingRow
              icon={Key}
              title="API Access"
              description={
                apiKeyInfo?.key_prefix
                  ? `Active key: ${apiKeyInfo.key_prefix}…`
                  : "Generate a key to call the API from external systems"
              }
              status={
                <StatusBadge active={!!apiKeyInfo?.key_prefix} activeLabel="Active" inactiveLabel="No key" />
              }
              actionLabel="Manage"
              onClick={() => setOpenDialog("apikey")}
            />

            <SettingRow
              iconNode={<OpikLogo className="size-6" />}
              title="Opik Observability"
              description="Trace and monitor your agent runs with deep observability"
              status={
                <StatusBadge active={!!config?.opik_enabled} activeLabel="Enabled" inactiveLabel="Disabled" />
              }
              onClick={() => setOpenDialog("opik")}
            />

            <SettingRow
              icon={SlackIcon}
              title="Slack Integration"
              description="Let incoming Slack messages be answered by your agent"
              status={
                <StatusBadge active={!!config?.slack_enabled} activeLabel="Enabled" inactiveLabel="Disabled" />
              }
              onClick={() => setOpenDialog("slack")}
            />

            <SettingRow
              icon={Mail}
              title="Email (Gmail)"
              description="Let agents send email from your Gmail via the send_email tool"
              status={
                <StatusBadge
                  active={!!config?.gmail_address && !!config?.gmail_app_password_set}
                  activeLabel="Connected"
                  inactiveLabel="Not configured"
                />
              }
              onClick={() => setOpenDialog("gmail")}
            />
          </section>
        </div>

        {/* ---- Dialogs ---- */}
        {config && (
          <>
            <ProvidersDialog
              open={openDialog === "providers"}
              onOpenChange={(o) => setOpenDialog(o ? "providers" : null)}
              config={config}
              saving={saving}
              onSave={saveConfig}
            />
            <OpikDialog
              open={openDialog === "opik"}
              onOpenChange={(o) => setOpenDialog(o ? "opik" : null)}
              config={config}
              saving={saving}
              onSave={saveConfig}
            />
            <SlackDialog
              open={openDialog === "slack"}
              onOpenChange={(o) => setOpenDialog(o ? "slack" : null)}
              config={config}
              agents={agents}
              saving={saving}
              onSave={saveConfig}
            />
            <GmailDialog
              open={openDialog === "gmail"}
              onOpenChange={(o) => setOpenDialog(o ? "gmail" : null)}
              config={config}
              saving={saving}
              onSave={saveConfig}
            />
          </>
        )}

        <ApiKeyDialog
          open={openDialog === "apikey"}
          onOpenChange={(o) => {
            setOpenDialog(o ? "apikey" : null);
            if (!o) setNewApiKey(null);
          }}
          apiKeyInfo={apiKeyInfo}
          newApiKey={newApiKey}
          copied={copied}
          loading={apiKeyLoading}
          onCopy={handleCopyApiKey}
          onGenerate={handleGenerateApiKey}
          onRevoke={handleRevokeApiKey}
        />

      <div className="mx-auto max-w-3xl mt-4">                                                                                                                  
        <div className="flex items-start gap-3 rounded-xl border border-primary bg-primary/20 p-4 dark:border-primary dark:bg-primary/20">                      
          <Info className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" />                                                                          
          <p className="text-sm text-blue-700 dark:text-blue-300">                                                                                            
          This configuration is shared across all your workspaces. Changes here apply everywhere.                                                             
          </p>                                                                                                                                                
        </div>                                                                                                                                           
      </div> 

      </PageLayout>
    </AppLayout>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog: AI Providers                                               */
/* ------------------------------------------------------------------ */

function ProvidersDialog({
  open,
  onOpenChange,
  config,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  config: UserConfig;
  saving: boolean;
  onSave: (patch: ConfigPayload) => Promise<boolean>;
}) {
  const [google, setGoogle] = React.useState("");
  const [openai, setOpenai] = React.useState("");
  const [anthropic, setAnthropic] = React.useState("");
  const [model, setModel] = React.useState("gemini-2.5-flash");

  React.useEffect(() => {
    if (open) {
      setGoogle(config.google_api_key_set ? SECRET_MASK : "");
      setOpenai(config.openai_api_key_set ? SECRET_MASK : "");
      setAnthropic(config.anthropic_api_key_set ? SECRET_MASK : "");
      setModel(config.default_model ?? "gemini-2.5-flash");
    }
  }, [open, config]);

  const submit = async () => {
    // Secrets are write-only (never returned to the client). Only send a key
    // when the user actually typed one; a blank field means "keep the saved key".
    const patch: ConfigPayload = { default_model: model };
    if (google.trim() && google !== SECRET_MASK) patch.google_api_key = google.trim();
    if (openai.trim() && openai !== SECRET_MASK) patch.openai_api_key = openai.trim();
    if (anthropic.trim() && anthropic !== SECRET_MASK) patch.anthropic_api_key = anthropic.trim();
    const ok = await onSave(patch);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            AI Providers
          </DialogTitle>
          <DialogDescription>
            Add a key for each provider you want to use, then pick a default model.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="google-api-key">Google API Key</Label>
            <SecretInput id="google-api-key" value={google} onChange={setGoogle} placeholder={config.google_api_key_set ? "•••• saved — leave blank to keep" : "For Gemini models"} />
            <p className="text-xs text-muted-foreground">
              Get a key at <FieldLink href="https://aistudio.google.com/app/apikey">Google AI Studio</FieldLink>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="openai-api-key">OpenAI API Key</Label>
            <SecretInput id="openai-api-key" value={openai} onChange={setOpenai} placeholder={config.openai_api_key_set ? "•••• saved — leave blank to keep" : "For GPT / o-series models"} />
            <p className="text-xs text-muted-foreground">
              Get a key at <FieldLink href="https://platform.openai.com/api-keys">OpenAI Platform</FieldLink>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="anthropic-api-key">Anthropic API Key</Label>
            <SecretInput id="anthropic-api-key" value={anthropic} onChange={setAnthropic} placeholder={config.anthropic_api_key_set ? "•••• saved — leave blank to keep" : "For Claude models"} />
            <p className="text-xs text-muted-foreground">
              Get a key at <FieldLink href="https://console.anthropic.com/settings/keys">Anthropic Console</FieldLink>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="default-model">Default Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="default-model" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={submit} disabled={saving}>
            {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog: Email (Gmail)                                              */
/* ------------------------------------------------------------------ */

function GmailDialog({
  open,
  onOpenChange,
  config,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  config: UserConfig;
  saving: boolean;
  onSave: (patch: ConfigPayload) => Promise<boolean>;
}) {
  const [address, setAddress] = React.useState("");
  const [appPassword, setAppPassword] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setAddress(config.gmail_address ?? "");
      setAppPassword(config.gmail_app_password_set ? SECRET_MASK : "");
    }
  }, [open, config]);

  const submit = async () => {
    // App password is write-only; only send it when the user typed one (blank = keep).
    const patch: ConfigPayload = { gmail_address: address.trim() || null };
    if (appPassword.trim() && appPassword !== SECRET_MASK) patch.gmail_app_password = appPassword.trim();
    const ok = await onSave(patch);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-5 text-primary" />
            Email (Gmail)
          </DialogTitle>
          <DialogDescription>
            Connect Gmail so agents can send email with the <code>send_email</code> tool.
            Uses an App Password over SMTP — stored encrypted at rest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="gmail-address">Gmail address</Label>
            <Input
              id="gmail-address"
              type="email"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="you@gmail.com"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gmail-app-password">App Password</Label>
            <SecretInput
              id="gmail-app-password"
              value={appPassword}
              onChange={setAppPassword}
              placeholder={config.gmail_app_password_set ? "•••••••• saved — leave blank to keep" : "16-character app password"}
            />
            <p className="text-xs text-muted-foreground">
              Requires 2-Step Verification. Create one at{" "}
              <FieldLink href="https://myaccount.google.com/apppasswords">
                Google App Passwords
              </FieldLink>
              {" "}— this is not your account password.
            </p>
          </div>
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={submit} disabled={saving}>
            {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog: Opik                                                       */
/* ------------------------------------------------------------------ */

function OpikDialog({
  open,
  onOpenChange,
  config,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  config: UserConfig;
  saving: boolean;
  onSave: (patch: ConfigPayload) => Promise<boolean>;
}) {
  const [enabled, setEnabled] = React.useState(false);
  const [apiKey, setApiKey] = React.useState("");
  const [workspace, setWorkspace] = React.useState("");
  const [project, setProject] = React.useState("atelier");
  const [urlOverride, setUrlOverride] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setEnabled(config.opik_enabled ?? false);
      setApiKey(config.opik_api_key_set ? SECRET_MASK : "");
      setWorkspace(config.opik_workspace ?? "");
      setProject(config.opik_project_name ?? "atelier");
      setUrlOverride(config.opik_url_override ?? "");
    }
  }, [open, config]);

  const submit = async () => {
    const patch: ConfigPayload = {
      opik_enabled: enabled,
      opik_workspace: workspace.trim() || null,
      opik_project_name: project.trim() || "atelier",
      opik_url_override: urlOverride.trim() || null,
    };
    if (apiKey.trim() && apiKey !== SECRET_MASK) patch.opik_api_key = apiKey.trim();  // write-only secret
    const ok = await onSave(patch);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <OpikLogo className="size-5" />
            Opik Observability
          </DialogTitle>
          <DialogDescription>
            Connect to <FieldLink href="https://www.comet.com/opik">Opik</FieldLink> to trace and monitor agent runs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
            <Label htmlFor="opik-enabled" className="cursor-pointer">Enable Opik Tracing</Label>
            <Switch id="opik-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className={cn("space-y-4 transition-opacity", !enabled && "pointer-events-none opacity-50")}>
            <div className="space-y-2">
              <Label htmlFor="opik-api-key">Opik API Key</Label>
              <SecretInput id="opik-api-key" value={apiKey} onChange={setApiKey} placeholder={config.opik_api_key_set ? "•••• saved — leave blank to keep" : "Your Opik API key"} disabled={!enabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="opik-workspace">Workspace</Label>
              <Input id="opik-workspace" placeholder="Your Opik workspace name" value={workspace} onChange={(e) => setWorkspace(e.target.value)} disabled={!enabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="opik-project-name">Project Name</Label>
              <Input id="opik-project-name" placeholder="atelier" value={project} onChange={(e) => setProject(e.target.value)} disabled={!enabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="opik-url-override">API URL Override</Label>
              <Input id="opik-url-override" placeholder="Leave empty for Opik Cloud" value={urlOverride} onChange={(e) => setUrlOverride(e.target.value)} disabled={!enabled} />
              <p className="text-xs text-muted-foreground">e.g. https://www.comet.com/opik/api</p>
            </div>
          </div>
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={submit} disabled={saving}>
            {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog: Slack                                                      */
/* ------------------------------------------------------------------ */

function SlackDialog({
  open,
  onOpenChange,
  config,
  agents,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  config: UserConfig;
  agents: AgentItem[];
  saving: boolean;
  onSave: (patch: ConfigPayload) => Promise<boolean>;
}) {
  const [enabled, setEnabled] = React.useState(false);
  const [botToken, setBotToken] = React.useState("");
  const [signingSecret, setSigningSecret] = React.useState("");
  const [appToken, setAppToken] = React.useState("");
  const [botUserId, setBotUserId] = React.useState("");
  const [channel, setChannel] = React.useState("");
  const [agentId, setAgentId] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setEnabled(config.slack_enabled ?? false);
      setBotToken(config.slack_bot_token_set ? SECRET_MASK : "");
      setSigningSecret(config.slack_signing_secret_set ? SECRET_MASK : "");
      setAppToken(config.slack_app_token_set ? SECRET_MASK : "");
      setBotUserId(config.slack_bot_user_id ?? "");
      setChannel(config.slack_default_channel ?? "");
      setAgentId(config.slack_default_agent_id ? String(config.slack_default_agent_id) : "");
    }
  }, [open, config]);

  const submit = async () => {
    const patch: ConfigPayload = {
      slack_enabled: enabled,
      slack_bot_user_id: botUserId.trim() || null,
      slack_default_channel: channel.trim() || null,
      slack_default_agent_id: agentId ? Number(agentId) : null,
    };
    // Write-only secrets: only send when the user typed one (blank = keep saved).
    if (botToken.trim() && botToken !== SECRET_MASK) patch.slack_bot_token = botToken.trim();
    if (signingSecret.trim() && signingSecret !== SECRET_MASK) patch.slack_signing_secret = signingSecret.trim();
    if (appToken.trim() && appToken !== SECRET_MASK) patch.slack_app_token = appToken.trim();
    const ok = await onSave(patch);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlackIcon className="size-5 text-primary" />
            Slack Integration
          </DialogTitle>
          <DialogDescription>
            Configure Slack so incoming messages can be answered by your selected agent.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-1 pr-1">
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
            <Label htmlFor="slack-enabled" className="cursor-pointer">Enable Slack Integration</Label>
            <Switch id="slack-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className={cn("space-y-4 transition-opacity", !enabled && "pointer-events-none opacity-50")}>
            <div className="space-y-2">
              <Label htmlFor="slack-bot-token">Bot Token</Label>
              <SecretInput id="slack-bot-token" value={botToken} onChange={setBotToken} placeholder={config.slack_bot_token_set ? "•••• saved — leave blank to keep" : "xoxb-…"} disabled={!enabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack-signing-secret">Signing Secret</Label>
              <SecretInput id="slack-signing-secret" value={signingSecret} onChange={setSigningSecret} placeholder={config.slack_signing_secret_set ? "•••• saved — leave blank to keep" : "Slack signing secret"} disabled={!enabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack-app-token">App Token (Optional)</Label>
              <SecretInput id="slack-app-token" value={appToken} onChange={setAppToken} placeholder={config.slack_app_token_set ? "•••• saved — leave blank to keep" : "xapp-…"} disabled={!enabled} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="slack-bot-user-id">Bot User ID</Label>
                <Input id="slack-bot-user-id" placeholder="U0123456789" value={botUserId} onChange={(e) => setBotUserId(e.target.value)} disabled={!enabled} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slack-default-channel">Default Channel</Label>
                <Input id="slack-default-channel" placeholder="C0123456789" value={channel} onChange={(e) => setChannel(e.target.value)} disabled={!enabled} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack-default-agent">Default Agent</Label>
              <Select value={agentId || "none"} onValueChange={(v) => setAgentId(v === "none" ? "" : v)} disabled={!enabled}>
                <SelectTrigger id="slack-default-agent" className="w-full">
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.label || a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Set your Slack Events Request URL to <code className="rounded bg-background px-1 py-0.5">/api/v1/slack/events</code> on this backend.
            </p>
          </div>
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={submit} disabled={saving}>
            {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog: API Key                                                    */
/* ------------------------------------------------------------------ */

function ApiKeyDialog({
  open,
  onOpenChange,
  apiKeyInfo,
  newApiKey,
  copied,
  loading,
  onCopy,
  onGenerate,
  onRevoke,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  apiKeyInfo: ApiKeyInfo | null;
  newApiKey: string | null;
  copied: boolean;
  loading: boolean;
  onCopy: () => void;
  onGenerate: () => void;
  onRevoke: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="size-5 text-primary" />
            API Access
          </DialogTitle>
          <DialogDescription>
            Integrate your agents into external systems. Pass the key in the{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">X-API-Key</code> header.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {newApiKey && (
            <div className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-4">
              <p className="flex items-center gap-1.5 text-sm font-medium text-warning-foreground">
                <AlertTriangle className="size-4 text-warning" />
                Copy this key now — it won&apos;t be shown again.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={newApiKey} className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={onCopy} title="Copy">
                  {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
          )}

          {apiKeyInfo?.key_prefix && !newApiKey && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">Active key</span>
              <code className="rounded bg-background px-2 py-1 font-mono text-sm">{apiKeyInfo.key_prefix}…</code>
            </div>
          )}

          {!apiKeyInfo?.key_prefix && !newApiKey && (
            <p className="text-sm text-muted-foreground">No API key yet. Generate one to get started.</p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {apiKeyInfo?.key_prefix ? (
            <Button variant="outline" onClick={onRevoke} disabled={loading} className="text-destructive hover:text-destructive">
              <Trash2 className="size-4" />
              Revoke
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={onGenerate} disabled={loading}>
            {loading ? <RefreshCw className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {apiKeyInfo?.key_prefix ? "Regenerate" : "Generate"} key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
