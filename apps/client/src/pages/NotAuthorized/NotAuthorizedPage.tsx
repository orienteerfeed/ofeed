import { Link, useRouter } from '@tanstack/react-router';
import { Home, RotateCcw, Shield } from 'lucide-react';
import { Button } from '../../components/atoms';

export const NotAuthorizedPage = () => {
  const router = useRouter();

  const handleGoBack = () => {
    router.history.back();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="text-center space-y-8 max-w-sm">
        {/* Visual Element */}
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 bg-muted/30 rounded-full flex items-center justify-center">
                <Shield className="h-12 w-12 text-muted-foreground/60" />
              </div>
              <div className="absolute -top-2 -right-2">
                <div className="bg-destructive text-destructive-foreground text-sm font-mono px-2 py-1 rounded">
                  403
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-2xl font-bold tracking-tight">Access denied</h1>
            <p className="text-muted-foreground leading-relaxed">
              You don't have permission to access this page. Please contact your
              administrator if you believe this is an error.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <Button onClick={handleGoBack} variant="outline" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Go back
          </Button>

          <Button asChild className="gap-2">
            <Link to="/">
              <Home className="h-4 w-4" />
              Back to home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};
