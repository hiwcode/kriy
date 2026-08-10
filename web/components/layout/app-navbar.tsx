"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/layout/notification-bell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { getBreadcrumb, siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { Building2, ChevronRight, BookOpen, Check, Github, LogOut, Settings, Star, Users, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useWorkspace } from "@/components/workspace/workspace-provider";

export function AppNavbar({ className }: { className?: string }) {
  const pathname = usePathname();
  const breadcrumb = getBreadcrumb(pathname);
  const auth = useAuth();
  const workspace = useWorkspace();
  const BreadcrumbIcon = breadcrumb.icon;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border/70 bg-background/90 px-2 backdrop-blur-xl sm:px-4",
        className
      )}
    >
      {/* Left Section */}
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="size-8 text-muted-foreground hover:text-foreground" />

        {/* Workspace Switcher */}
        {workspace && !workspace.isLoading && workspace.workspaces.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="group hidden max-w-52 sm:flex">
                <Users aria-hidden />
                <span className="max-w-[120px] truncate font-medium">
                  {workspace.activeWorkspace?.name ?? "Workspace"}
                </span>
                <ChevronDown aria-hidden className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Workspaces
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                {workspace.workspaces.map((ws) => {
                  const isActive = workspace.activeWorkspace?.id === ws.id;
                  return (
                    <DropdownMenuItem
                      key={ws.id}
                      onClick={() => workspace.setActiveWorkspace(ws)}
                      className="gap-2"
                    >
                      <span className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Users aria-hidden />
                      </span>
                      <span className={cn("flex-1 truncate", isActive && "font-medium")}>
                        {ws.name}
                        {ws.is_personal && (
                          <span className="text-muted-foreground"> · Personal</span>
                        )}
                      </span>
                      {isActive && <Check aria-hidden className="text-primary" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/workspace/settings">
                    <Settings aria-hidden />
                    Workspace settings
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Separator orientation="vertical" className="mx-1 hidden h-4 md:block" />

        {/* Breadcrumb / Page Title */}
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
          {BreadcrumbIcon && (
            <BreadcrumbIcon className="hidden size-4 shrink-0 text-muted-foreground md:block" aria-hidden />
          )}
          {breadcrumb.parent && (
            <>
              <span className="hidden text-sm text-muted-foreground lg:inline">
                {breadcrumb.parent}
              </span>
              <ChevronRight className="hidden size-3.5 text-muted-foreground/60 lg:inline" aria-hidden />
            </>
          )}
          <span className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
            {breadcrumb.title}
          </span>
        </nav>

      </div>

      {/* Right Section */}
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" className="mr-1 hidden lg:inline-flex" asChild>
          <a href={siteConfig.github} target="_blank" rel="noopener noreferrer">
            <Star data-icon="inline-start" />
            Star on GitHub
          </a>
        </Button>
        <NotificationBell />
        <ThemeToggle isHeader={true}/>
        {/* Auth: Sign in button or User dropdown */}
        {auth?.isLoading ? (
          <div className="size-9 animate-pulse rounded-full bg-muted" />
        ) : auth?.isSignedIn && auth.user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group flex items-center gap-3 rounded-xl p-1.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar size="lg">
                  <AvatarImage src={auth.user.picture} alt={auth.user.name} />
                  <AvatarFallback>
                    {auth.user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" align="end" sideOffset={8}>
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-3 py-1">
                  <Avatar size="lg">
                    <AvatarImage src={auth.user.picture} alt={auth.user.name} />
                    <AvatarFallback>
                      {auth.user.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium leading-none">
                      {auth.user.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {auth.user.email}
                    </p>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/config">
                    <Settings aria-hidden />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/workspace/settings">
                    <Building2 aria-hidden />
                    <span>Workspace settings</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/docs">
                    <BookOpen aria-hidden />
                    <span>Documentation</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={siteConfig.github} target="_blank" rel="noopener noreferrer">
                    <Github aria-hidden />
                    <span>Star on GitHub</span>
                  </a>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => auth.signOut()}
                >
                  <LogOut aria-hidden />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : auth?.signInButton ? (
          auth.signInButton
        ) : null}
      </div>
    </header>
  );
}
