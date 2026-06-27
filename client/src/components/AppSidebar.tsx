import { Home, FolderOpen, BarChart3, FileText, Settings, Box, User, ScanLine, Target } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";

const menuItems = [
  { title: "Dashboard",        url: "/",            icon: Home },
  { title: "Projects",         url: "/projects",    icon: FolderOpen },
  { title: "3D Reconstruction",url: "/reconstruct", icon: ScanLine },
  { title: "3D Analysis",      url: "/mesh-analysis",icon: Box },
  { title: "Accuracy Centre",  url: "/accuracy",    icon: Target },
  { title: "Analytics",        url: "/analytics",   icon: BarChart3 },
  { title: "Reports",          url: "/reports",     icon: FileText },
  { title: "Settings",         url: "/settings",    icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-mono font-bold text-sm">CA</span>
          </div>
          <div>
            <h2 className="font-semibold text-sm">Coal Assessment</h2>
            <p className="text-xs text-muted-foreground">Volume & Weight System</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-${item.title.toLowerCase()}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium">User</span>
          </div>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
