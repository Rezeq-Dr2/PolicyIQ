import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { 
  LayoutDashboard, 
  FileText, 
  BarChart3, 
  Settings, 
  Shield,
  LogOut,
  TrendingUp,
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Menu,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";


interface SidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export default function Sidebar({ isCollapsed = false, onToggle }: SidebarProps = {}) {
  const [location] = useLocation();
  const { user } = useAuth();
  const [isHovered, setIsHovered] = useState(false);

  // Create navigation with conditional admin link
  const getNavigation = () => {
    const baseNavigation = [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Policy Documents", href: "/upload", icon: FileText },
      { name: "Compliance Reports", href: "/reports", icon: BarChart3 },
      { name: "Analytics", href: "/analytics", icon: TrendingUp },
      { name: "Executive Reports", href: "/executive", icon: Users },
      { name: "Compliance Calendar", href: "/calendar", icon: Calendar },
      { name: "Regulatory Monitor", href: "/regulatory", icon: Search },
      { name: "Settings", href: "/settings", icon: Settings },
    ];

    // Add admin link if user has admin role
    if (user?.role === 'admin') {
      baseNavigation.splice(-1, 0, { name: "Admin", href: "/admin", icon: Shield });
    }

    return baseNavigation;
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <aside 
      className={cn(
        "hidden lg:flex lg:flex-shrink-0 transition-all duration-300 ease-in-out",
        isCollapsed && !isHovered ? "lg:w-16" : "lg:w-64"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={cn(
        "flex flex-col bg-card border-r border-border transition-all duration-300 ease-in-out",
        isCollapsed && !isHovered ? "w-16" : "w-64"
      )}>
        {/* Logo & Brand */}
        <div className={cn(
          "flex items-center border-b border-border transition-all duration-200",
          isCollapsed && !isHovered ? "px-2 py-4 justify-center" : "px-6 py-4"
        )}>
          <div className={cn(
            "flex items-center w-full transition-all duration-200",
            isCollapsed && !isHovered ? "justify-center" : "justify-between"
          )}>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Shield className="text-primary-foreground text-sm" />
              </div>
              {(!isCollapsed || isHovered) && (
                <span className="text-xl font-bold text-foreground transition-opacity duration-200">
                  PolicyIQ
                </span>
              )}
            </div>
            {onToggle && (!isCollapsed || isHovered) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
                className="p-1 h-8 w-8 transition-all duration-200 hover:bg-muted"
                data-testid="button-toggle-sidebar"
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </Button>
            )}
          </div>
          {/* Toggle button for collapsed state */}
          {onToggle && isCollapsed && !isHovered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="absolute top-4 right-1 p-1 h-6 w-6 transition-all duration-200 hover:bg-muted z-10"
              data-testid="button-toggle-sidebar-collapsed"
            >
              <ChevronRight className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {getNavigation().map((item) => {
            const isActive = location === item.href;
            return (
              <a
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors relative group",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                data-testid={`nav-${item.name.toLowerCase().replace(" ", "-")}`}
                title={isCollapsed && !isHovered ? item.name : undefined}
              >
                <item.icon className={cn(
                  "text-sm w-4 h-4 transition-all duration-200",
                  isCollapsed && !isHovered ? "mr-0" : "mr-3"
                )} />
                {(!isCollapsed || isHovered) && (
                  <span className="transition-opacity duration-200">
                    {item.name}
                  </span>
                )}
                {/* Tooltip for collapsed state */}
                {isCollapsed && !isHovered && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none">
                    {item.name}
                  </div>
                )}
              </a>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="px-4 py-4 border-t border-border">
          <div className={cn(
            "flex items-center mb-3 transition-all duration-200",
            isCollapsed && !isHovered ? "justify-center" : "space-x-3"
          )}>
            <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-secondary-foreground">
                {(user as any)?.firstName?.[0] || (user as any)?.email?.[0] || "U"}
              </span>
            </div>
            {(!isCollapsed || isHovered) && (
              <div className="flex-1 min-w-0 transition-opacity duration-200">
                <p className="text-sm font-medium text-foreground truncate" data-testid="text-user-name">
                  {(user as any)?.firstName && (user as any)?.lastName 
                    ? `${(user as any).firstName} ${(user as any).lastName}`
                    : (user as any)?.email || "User"
                  }
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  Organization Member
                </p>
              </div>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleLogout}
            className={cn(
              "text-muted-foreground hover:text-foreground transition-all duration-200",
              isCollapsed && !isHovered 
                ? "w-8 h-8 p-0 justify-center" 
                : "w-full justify-start"
            )}
            data-testid="button-logout"
            title={isCollapsed && !isHovered ? "Sign Out" : undefined}
          >
            <LogOut className={cn(
              "w-4 h-4 transition-all duration-200",
              isCollapsed && !isHovered ? "mr-0" : "mr-2"
            )} />
            {(!isCollapsed || isHovered) && (
              <span className="transition-opacity duration-200">Sign Out</span>
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
