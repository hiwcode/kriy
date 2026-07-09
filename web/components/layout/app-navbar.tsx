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
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getBreadcrumb } from "@/config/site";
import { cn } from "@/lib/utils";
import { ChevronRight, BookOpen, Check, Github, LogOut, Search, Settings, Star, User, Users, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { siteConfig } from "@/config/site";

export function AppNavbar({ className }: { className?: string }) {
  const pathname = usePathname();
  const breadcrumb = getBreadcrumb(pathname);
  const auth = useAuth();
  const workspace = useWorkspace();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-border/70 bg-sidebar pr-6 backdrop-blur-xl",
        "transition-all duration-300 ease-out",
        className
      )}
    >
      {/* Left Section */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="size-8 text-muted-foreground hover:text-foreground" />

        {/* Workspace Switcher */}
        {workspace && !workspace.isLoading && workspace.workspaces.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group flex items-center gap-2 rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-sm shadow-xs transition-colors hover:bg-accent/60 hover:text-accent-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Users className="size-3" />
                </span>
                <span className="max-w-[120px] truncate font-medium">
                  {workspace.activeWorkspace?.name ?? "Workspace"}
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Workspaces
              </DropdownMenuLabel>
              {workspace.workspaces.map((ws) => {
                const isActive = workspace.activeWorkspace?.id === ws.id;
                return (
                  <DropdownMenuItem
                    key={ws.id}
                    onClick={() => workspace.setActiveWorkspace(ws)}
                    className="gap-2"
                  >
                    <span className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Users className="size-3" />
                    </span>
                    <span className={cn("flex-1 truncate", isActive && "font-medium")}>
                      {ws.name}
                      {ws.is_personal && (
                        <span className="text-muted-foreground"> · Personal</span>
                      )}
                    </span>
                    {isActive && <Check className="size-3.5 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/workspace/settings">
                  <Settings className="size-4" />
                  Workspace settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Separator */}
        <div className="hidden h-5 w-px bg-border md:block" />

        {/* Breadcrumb / Page Title */}
        <nav className="flex items-center gap-1.5">
          {breadcrumb.parent && (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {breadcrumb.parent}
              </span>
              <ChevronRight className="hidden size-3.5 text-muted-foreground/60 sm:inline" />
            </>
          )}
          <span className="text-base font-semibold tracking-tight text-foreground">
            {breadcrumb.title}
          </span>
        </nav>

      </div>

      {/* Right Section */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="hidden gap-2 md:flex"
          asChild
        >
          <a
            href={siteConfig.github}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="size-4" />
            <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-xs">Star</span>
          </a>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden size-9"
          asChild
        >
          <a
            href={siteConfig.github}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="size-4" />
          </a>
        </Button>
        <NotificationBell />
        <ThemeToggle />
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
                  <div className="flex flex-col space-y-1">
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
                    <User className="size-4" />
                    <span>Config</span>
                    <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/docs">
                    <BookOpen className="size-4" />
                    <span>Documentation</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => auth.signOut()}
              >
                <LogOut className="size-4" />
                <span>Log out</span>
                <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : auth?.signInButton ? (
          auth.signInButton
        ) : null}
      </div>
    </header>
  );
}
