import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MainPageLayout } from '@/templates';
import { Blocks, Shield, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/atoms';
import { useAuth } from '../../hooks';
import { OAuth2CredentialsCard } from './OAuth2CredentialsForm';

interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  club: string;
  siCardNumber: string;
  emergencyContact: string;
}

export const ProfilePage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [profile, setProfile] = useState<Profile>({
    firstName: '',
    lastName: '',
    email: '',
    club: '',
    siCardNumber: '',
    emergencyContact: '',
  });

  // Naplň state z user dat při načtení nebo změně usera
  useEffect(() => {
    if (user) {
      setProfile({
        firstName: user.firstname || '',
        lastName: user.lastname || '',
        email: user.email || '',
        club: user.club || '',
        siCardNumber: '',
        emergencyContact: '',
      });
    }
  }, [user]);

  const handleSave = (): void => {
    setIsEditing(false);
    // TODO: Save to backend API
    console.log('Saving profile:', profile);
  };

  const handleInputChange = (field: keyof Profile, value: string): void => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  // Pokud user není přihlášený, zobraz loading nebo redirect
  if (!user) {
    return (
      <MainPageLayout t={t} pageName={t('Pages.Profile.Tabs.Profile')}>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="flex justify-center items-center h-64">
            <p className="text-muted-foreground">
              {t('Loading', { ns: 'common' })}
            </p>
          </div>
        </div>
      </MainPageLayout>
    );
  }

  const userInitials =
    `${profile.firstName[0] || ''}${profile.lastName[0] || ''}`.toUpperCase();

  return (
    <MainPageLayout t={t} pageName={t('Pages.Profile.Tabs.Profile')}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="text-2xl">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold">
                {profile.firstName} {profile.lastName}
              </h1>
              <p className="text-muted-foreground">{profile.club}</p>
            </div>
          </div>

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="profile">
                <User className="h-4 w-4 mr-2" />
                {t('Pages.Profile.Tabs.Profile')}
              </TabsTrigger>
              <TabsTrigger value="integrations">
                <Blocks className="h-4 w-4 mr-2" />
                {t('Pages.Profile.Tabs.Integrations')}
              </TabsTrigger>
              <TabsTrigger value="security">
                <Shield className="h-4 w-4 mr-2" />
                {t('Pages.Profile.Tabs.Security')}
              </TabsTrigger>
              {/*<TabsTrigger value="notifications">
                <Bell className="h-4 w-4 mr-2" />
                {t('Pages.Profile.Tabs.Notifications')}
              </TabsTrigger>
              <TabsTrigger value="security">
                <Shield className="h-4 w-4 mr-2" />
                {t('Pages.Profile.Tabs.Security')}
              </TabsTrigger>
              <TabsTrigger value="billing">
                <CreditCard className="h-4 w-4 mr-2" />
                {t('Pages.Profile.Tabs.billing')}
              </TabsTrigger>*/}
            </TabsList>

            <TabsContent value="profile" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>
                        {t('Pages.Profile.PersonalInfo.Title')}
                      </CardTitle>
                      <CardDescription>
                        {t('Pages.Profile.PersonalInfo.Description')}
                      </CardDescription>
                    </div>
                    {!isEditing ? (
                      <Button onClick={() => setIsEditing(true)}>
                        {t('Operations.Update', { ns: 'common' })}
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setIsEditing(false)}
                        >
                          {t('Operations.Cancel', { ns: 'common' })}
                        </Button>
                        <Button onClick={handleSave}>
                          {t('Operations.Save', { ns: 'common' })}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">
                        {t('Pages.Auth.User.Firstname')}
                      </Label>
                      <Input
                        id="firstName"
                        value={profile.firstName}
                        onChange={e =>
                          handleInputChange('firstName', e.target.value)
                        }
                        disabled={!isEditing}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">
                        {t('Pages.Auth.User.Lastname')}
                      </Label>
                      <Input
                        id="lastName"
                        value={profile.lastName}
                        onChange={e =>
                          handleInputChange('lastName', e.target.value)
                        }
                        disabled={!isEditing}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('Pages.Auth.User.Email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={e => handleInputChange('email', e.target.value)}
                      disabled={!isEditing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="club">{t('Pages.Auth.User.Club')}</Label>
                    <Input
                      id="club"
                      value={profile.club}
                      onChange={e => handleInputChange('club', e.target.value)}
                      disabled={!isEditing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="siCard">
                      {t('Pages.Profile.PersonalInfo.SiCardNumber')}
                    </Label>
                    <Input
                      id="siCard"
                      value={profile.siCardNumber}
                      onChange={e =>
                        handleInputChange('siCardNumber', e.target.value)
                      }
                      disabled={!isEditing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergency">
                      {t('Pages.Profile.PersonalInfo.EmergencyContact')}
                    </Label>
                    <Input
                      id="emergency"
                      value={profile.emergencyContact}
                      onChange={e =>
                        handleInputChange('emergencyContact', e.target.value)
                      }
                      disabled={!isEditing}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('Pages.Profile.MyEntries.Title')}</CardTitle>
                  <CardDescription>
                    {t('Pages.Profile.MyEntries.Description')}
                  </CardDescription>
                </CardHeader>
                <CardContent></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('Pages.Auth.User.Password')}</CardTitle>
                  <CardDescription>
                    {t('Pages.Profile.Security.PasswordDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">
                      {t('Pages.Profile.Security.CurrentPassword')}
                    </Label>
                    <Input id="currentPassword" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">
                      {t('Pages.Profile.Security.NewPassword')}
                    </Label>
                    <Input id="newPassword" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmNewPassword">
                      {t('Pages.Profile.Security.ConfirmNewPassword')}
                    </Label>
                    <Input id="confirmNewPassword" type="password" />
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button>
                        {t('Pages.Profile.Security.UpdatePassword')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t('NotImplementedTitle', { ns: 'common' })}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('NotImplementedDescription', { ns: 'common' })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogAction>
                          {t('Close', { ns: 'common' })}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TODO: implement tabs notifications, security, billing as needed
            <TabsContent value="notifications" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('Pages.Profile.Notifications.Title')}
                  </CardTitle>
                  <CardDescription>
                    {t('Pages.Profile.Notifications.Description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {t('Pages.Profile.Notifications.EventReminders')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t(
                          'Pages.Profile.Notifications.EventRemindersDescription'
                        )}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      {t('Operations.Configure', { ns: 'common' })}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {t('Pages.Profile.Notifications.ResultsUpdates')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t(
                          'Pages.Profile.Notifications.ResultsUpdatesDescription'
                        )}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      {t('Operations.Configure', { ns: 'common' })}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="billing" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('Pages.Profile.Billing.Title')}</CardTitle>
                  <CardDescription>
                    {t('Pages.Profile.Billing.Description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    {t('Pages.Profile.Billing.NoPaymentMethods')}
                  </p>
                  <Button className="mt-4">
                    {t('Pages.Profile.Billing.AddPaymentMethod')}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
            */}
            <TabsContent value="integrations" className="space-y-6">
              <OAuth2CredentialsCard />

              {/* You can add more integration cards here in the future */}
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('Pages.Profile.OtherIntegrations.Title')}
                  </CardTitle>
                  <CardDescription>
                    {t('Pages.Profile.OtherIntegrations.Description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    {t('ComingSoon', { ns: 'common' })}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MainPageLayout>
  );
};
