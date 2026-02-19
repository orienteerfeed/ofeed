import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MainPageLayout } from '@/templates';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useForm } from '@tanstack/react-form';
import { Blocks, Pencil, Shield, Trash2, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/atoms';
import { PasswordStrengthIndicator } from '../../components/molecules';
import { Field } from '../../components/organisms';
import { useAuth } from '../../hooks';
import { toast } from '../../utils';
import { OAuth2CredentialsCard } from './OAuth2CredentialsForm';

interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  organisation: string;
  emergencyContact: string;
}

type UpdateCurrentUserResponse = {
  updateCurrentUser: {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
    organisation?: string | null;
    emergencyContact?: string | null;
  };
};

type UserCardType = 'SPORTIDENT';

type ProfileSport = {
  id: number;
  name: string;
};

type ProfileCard = {
  id: number;
  sportId: number;
  cardNumber: string;
  type: UserCardType;
  isDefault: boolean;
  sport: ProfileSport;
};

type ProfileCardsResponse = {
  sports: ProfileSport[];
  currentUserCards: ProfileCard[];
};

type UpdateCurrentUserVars = {
  input: {
    firstname: string;
    lastname: string;
    email: string;
    organisation?: string | null;
    emergencyContact?: string | null;
  };
};

type CreateUserCardResponse = {
  createUserCard: {
    id: number;
  };
};

type CreateUserCardVars = {
  input: {
    sportId: number;
    type: UserCardType;
    cardNumber: string;
    isDefault?: boolean;
  };
};

type UpdateUserCardResponse = {
  updateUserCard: {
    id: number;
  };
};

type UpdateUserCardVars = {
  input: {
    id: number;
    sportId: number;
    type: UserCardType;
    cardNumber: string;
  };
};

type DeleteUserCardResponse = {
  deleteUserCard: boolean;
};

type DeleteUserCardVars = {
  id: number;
};

type SetDefaultUserCardResponse = {
  setDefaultUserCard: {
    id: number;
  };
};

type SetDefaultUserCardVars = {
  id: number;
};

type ChangeCurrentUserPasswordResponse = {
  changeCurrentUserPassword: {
    success: boolean;
    message?: string | null;
  };
};

type ChangeCurrentUserPasswordVars = {
  input: {
    currentPassword: string;
    newPassword: string;
  };
};

type ChangePasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

const UPDATE_CURRENT_USER_MUTATION = gql`
  mutation UpdateCurrentUser($input: UpdateCurrentUserInput!) {
    updateCurrentUser(input: $input) {
      id
      firstname
      lastname
      email
      organisation
      emergencyContact
    }
  }
`;

const GET_PROFILE_CARDS = gql`
  query ProfileCards {
    sports {
      id
      name
    }
    currentUserCards {
      id
      sportId
      cardNumber
      type
      isDefault
      sport {
        id
        name
      }
    }
  }
`;

const CREATE_USER_CARD_MUTATION = gql`
  mutation CreateUserCard($input: CreateUserCardInput!) {
    createUserCard(input: $input) {
      id
    }
  }
`;

const UPDATE_USER_CARD_MUTATION = gql`
  mutation UpdateUserCard($input: UpdateUserCardInput!) {
    updateUserCard(input: $input) {
      id
    }
  }
`;

const DELETE_USER_CARD_MUTATION = gql`
  mutation DeleteUserCard($id: Int!) {
    deleteUserCard(id: $id)
  }
`;

const SET_DEFAULT_USER_CARD_MUTATION = gql`
  mutation SetDefaultUserCard($id: Int!) {
    setDefaultUserCard(id: $id) {
      id
    }
  }
`;

const CHANGE_CURRENT_USER_PASSWORD_MUTATION = gql`
  mutation ChangeCurrentUserPassword($input: ChangeCurrentUserPasswordInput!) {
    changeCurrentUserPassword(input: $input) {
      success
      message
    }
  }
`;

export const ProfilePage = () => {
  const { t } = useTranslation();
  const { token, user, signin } = useAuth();
  const [isEditCardDialogOpen, setIsEditCardDialogOpen] = useState(false);
  const [cardForm, setCardForm] = useState<{
    sportId: string;
    type: UserCardType;
    cardNumber: string;
    setAsDefault: boolean;
  }>({
    sportId: '',
    type: 'SPORTIDENT',
    cardNumber: '',
    setAsDefault: false,
  });
  const [editCardForm, setEditCardForm] = useState<{
    id: number | null;
    sportId: string;
    type: UserCardType;
    cardNumber: string;
    setAsDefault: boolean;
  }>({
    id: null,
    sportId: '',
    type: 'SPORTIDENT',
    cardNumber: '',
    setAsDefault: false,
  });
  const [updateCurrentUser, { loading: isSaving }] = useMutation<
    UpdateCurrentUserResponse,
    UpdateCurrentUserVars
  >(UPDATE_CURRENT_USER_MUTATION);
  const {
    data: cardsData,
    loading: isCardsLoading,
    error: cardsError,
    refetch: refetchCards,
  } = useQuery<ProfileCardsResponse>(GET_PROFILE_CARDS, {
    skip: !user,
    fetchPolicy: 'cache-and-network',
  });
  const [createUserCard, { loading: isCreatingCard }] = useMutation<
    CreateUserCardResponse,
    CreateUserCardVars
  >(CREATE_USER_CARD_MUTATION);
  const [updateUserCard, { loading: isUpdatingCard }] = useMutation<
    UpdateUserCardResponse,
    UpdateUserCardVars
  >(UPDATE_USER_CARD_MUTATION);
  const [deleteUserCard, { loading: isDeletingCard }] = useMutation<
    DeleteUserCardResponse,
    DeleteUserCardVars
  >(DELETE_USER_CARD_MUTATION);
  const [setDefaultUserCard, { loading: isSettingDefaultCard }] = useMutation<
    SetDefaultUserCardResponse,
    SetDefaultUserCardVars
  >(SET_DEFAULT_USER_CARD_MUTATION);
  const [changeCurrentUserPassword, { loading: isChangingPassword }] =
    useMutation<
      ChangeCurrentUserPasswordResponse,
      ChangeCurrentUserPasswordVars
    >(CHANGE_CURRENT_USER_PASSWORD_MUTATION);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [profile, setProfile] = useState<Profile>({
    firstName: '',
    lastName: '',
    email: '',
    organisation: '',
    emergencyContact: '',
  });
  const sports = cardsData?.sports ?? [];
  const userCards = cardsData?.currentUserCards ?? [];
  const isCardMutationInProgress =
    isCreatingCard || isUpdatingCard || isDeletingCard || isSettingDefaultCard;

  // Naplň state z user dat při načtení nebo změně usera
  useEffect(() => {
    if (user) {
      setProfile({
        firstName: user.firstname || '',
        lastName: user.lastname || '',
        email: user.email || '',
        organisation: user.organisation ?? user.club ?? '',
        emergencyContact: user.emergencyContact ?? '',
      });
    }
  }, [user]);

  useEffect(() => {
    if (cardsError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          cardsError.message ||
          t('Errors.Generic', 'Something went wrong'),
        variant: 'error',
      });
    }
  }, [cardsError, t]);

  useEffect(() => {
    const firstSport = sports[0];
    if (firstSport && !cardForm.sportId) {
      setCardForm(prev => ({ ...prev, sportId: String(firstSport.id) }));
    }
  }, [sports, cardForm.sportId]);

  const handleSave = async (): Promise<void> => {
    try {
      const organisation = profile.organisation.trim();
      const emergencyContact = profile.emergencyContact.trim();
      const { data } = await updateCurrentUser({
        variables: {
          input: {
            firstname: profile.firstName.trim(),
            lastname: profile.lastName.trim(),
            email: profile.email.trim(),
            organisation: organisation.length > 0 ? organisation : null,
            emergencyContact:
              emergencyContact.length > 0 ? emergencyContact : null,
          },
        },
      });

      const updatedUser = data?.updateCurrentUser;
      if (!updatedUser) {
        throw new Error('Missing profile update payload');
      }

      setProfile(prev => ({
        ...prev,
        firstName: updatedUser.firstname,
        lastName: updatedUser.lastname,
        email: updatedUser.email,
        organisation: updatedUser.organisation ?? '',
        emergencyContact: updatedUser.emergencyContact ?? '',
      }));

      if (token && user) {
        signin({
          token,
          user: {
            ...user,
            id: updatedUser.id,
            firstname: updatedUser.firstname,
            lastname: updatedUser.lastname,
            email: updatedUser.email,
            organisation: updatedUser.organisation ?? null,
            emergencyContact: updatedUser.emergencyContact ?? null,
            club: updatedUser.organisation ?? null,
          },
        });
      }

      setIsEditing(false);
      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t(
          'Pages.Profile.PersonalInfo.Updated',
          'Profile updated successfully'
        ),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: t('Errors.UpdateProfileFailedTitle', 'Profile update failed'),
        description:
          error instanceof Error
            ? error.message
            : t('Errors.Generic', 'Something went wrong'),
        variant: 'error',
      });
    }
  };

  const handleInputChange = (field: keyof Profile, value: string): void => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const validateCurrentPassword = (value: string): string | undefined => {
    if (!value) {
      return t(
        'Pages.Profile.Security.Errors.CurrentPasswordRequired',
        'Current password is required',
      );
    }
    return undefined;
  };

  const validateNewPassword = (value: string): string | undefined => {
    if (!value) {
      return t(
        'Pages.Profile.Security.Errors.NewPasswordRequired',
        'New password is required',
      );
    }
    if (value.length < 8) {
      return t(
        'validation.passwordMinLength',
        'Password must be at least 8 characters',
      );
    }
    return undefined;
  };

  const validateConfirmNewPassword = (value: string): string | undefined => {
    const newPassword = passwordChangeForm.getFieldValue('newPassword');

    if (!value) {
      return t(
        'validation.confirmPasswordRequired',
        'Please confirm your new password',
      );
    }

    if (newPassword !== value) {
      return t('validation.passwordsDoNotMatch', 'Passwords do not match');
    }

    return undefined;
  };

  const extractRawMutationErrorMessage = (error: unknown): string => {
    if (error && typeof error === 'object') {
      if ('graphQLErrors' in error) {
        const graphQLErrors = (error as { graphQLErrors?: unknown }).graphQLErrors;

        if (
          Array.isArray(graphQLErrors) &&
          graphQLErrors[0] &&
          typeof graphQLErrors[0] === 'object' &&
          'message' in graphQLErrors[0] &&
          typeof (graphQLErrors[0] as { message?: unknown }).message === 'string'
        ) {
          return (graphQLErrors[0] as { message: string }).message;
        }
      }

      if (
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string'
      ) {
        return (error as { message: string }).message;
      }
    }

    return t('Errors.Generic', 'Something went wrong');
  };

  const clearPasswordSubmitErrors = (): void => {
    (['currentPassword', 'newPassword', 'confirmNewPassword'] as const).forEach(fieldName => {
      passwordChangeForm.setFieldMeta(fieldName, prev => ({
        ...prev,
        errorMap: {
          ...prev.errorMap,
          onSubmit: undefined,
        },
      }));
    });
  };

  const applyPasswordSubmitErrors = (
    fieldErrors: Partial<Record<keyof ChangePasswordFormValues, string>>,
  ): void => {
    if (Object.keys(fieldErrors).length === 0) {
      return;
    }

    (
      Object.entries(fieldErrors) as Array<
        [keyof ChangePasswordFormValues, string]
      >
    ).forEach(([fieldName, fieldError]) => {
      passwordChangeForm.setFieldMeta(fieldName, prev => ({
        ...prev,
        isTouched: true,
        isBlurred: true,
        errorMap: {
          ...prev.errorMap,
          onSubmit: fieldError,
        },
        errorSourceMap: {
          ...prev.errorSourceMap,
          onSubmit: 'form',
        },
      }));
    });
  };

  const mapPasswordMutationError = (
    error: unknown,
  ): {
    message: string;
    fieldErrors: Partial<Record<keyof ChangePasswordFormValues, string>>;
  } => {
    const rawMessage = extractRawMutationErrorMessage(error);
    const normalized = rawMessage.toLowerCase();

    if (normalized.includes('current password is incorrect')) {
      const message = t(
        'Pages.Profile.Security.Errors.CurrentPasswordIncorrect',
        'Current password is incorrect.',
      );
      return {
        message,
        fieldErrors: { currentPassword: message },
      };
    }

    if (normalized.includes('new password must be different from current password')) {
      const message = t(
        'Pages.Profile.Security.Errors.NewPasswordMustDiffer',
        'New password must be different from current password.',
      );
      return {
        message,
        fieldErrors: { newPassword: message },
      };
    }

    if (normalized.includes('at least 8')) {
      const message = t(
        'validation.passwordMinLength',
        'Password must be at least 8 characters',
      );
      return {
        message,
        fieldErrors: { newPassword: message },
      };
    }

    if (normalized.includes('passwords do not match')) {
      const message = t(
        'validation.passwordsDoNotMatch',
        'Passwords do not match',
      );
      return {
        message,
        fieldErrors: { confirmNewPassword: message },
      };
    }

    return {
      message: rawMessage,
      fieldErrors: {},
    };
  };

  const passwordChangeForm = useForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
    validators: {
      onChange: ({ value }) => {
        const errors: Partial<Record<keyof ChangePasswordFormValues, string>> =
          {};

        if (value.currentPassword) {
          const currentPasswordError = validateCurrentPassword(
            value.currentPassword,
          );
          if (currentPasswordError) {
            errors.currentPassword = currentPasswordError;
          }
        }

        if (value.newPassword) {
          const newPasswordError = validateNewPassword(value.newPassword);
          if (newPasswordError) {
            errors.newPassword = newPasswordError;
          }
        }

        if (value.newPassword && value.confirmNewPassword) {
          const confirmNewPasswordError = validateConfirmNewPassword(
            value.confirmNewPassword,
          );
          if (confirmNewPasswordError) {
            errors.confirmNewPassword = confirmNewPasswordError;
          }
        }

        return Object.keys(errors).length > 0 ? errors : undefined;
      },
      onSubmit: ({ value }) => {
        const errors: Partial<Record<keyof ChangePasswordFormValues, string>> =
          {};

        const currentPasswordError = validateCurrentPassword(
          value.currentPassword,
        );
        if (currentPasswordError) {
          errors.currentPassword = currentPasswordError;
        }

        const newPasswordError = validateNewPassword(value.newPassword);
        if (newPasswordError) {
          errors.newPassword = newPasswordError;
        }

        const confirmNewPasswordError = validateConfirmNewPassword(
          value.confirmNewPassword,
        );
        if (confirmNewPasswordError) {
          errors.confirmNewPassword = confirmNewPasswordError;
        }

        return Object.keys(errors).length > 0 ? errors : undefined;
      },
    },
    onSubmit: async ({ value }) => {
      clearPasswordSubmitErrors();

      try {
        const { data } = await changeCurrentUserPassword({
          variables: {
            input: {
              currentPassword: value.currentPassword,
              newPassword: value.newPassword,
            },
          },
        });

        const payload = data?.changeCurrentUserPassword;
        if (!payload?.success) {
          throw new Error(
            payload?.message || t('Errors.Generic', 'Something went wrong'),
          );
        }

        passwordChangeForm.reset();

        toast({
          title: t('Operations.Success', { ns: 'common' }),
          description:
            payload.message ||
            t(
              'Pages.Profile.Security.PasswordUpdated',
              'Password updated successfully',
            ),
          variant: 'success',
        });
      } catch (error) {
        const { message, fieldErrors } = mapPasswordMutationError(error);

        clearPasswordSubmitErrors();
        applyPasswordSubmitErrors(fieldErrors);

        toast({
          title: t('Errors.UpdatePasswordFailedTitle', 'Password update failed'),
          description: message,
          variant: 'error',
        });
      }
    },
  });

  const resetCardForm = (): void => {
    setCardForm({
      sportId: sports[0]?.id ? String(sports[0].id) : '',
      type: 'SPORTIDENT',
      cardNumber: '',
      setAsDefault: false,
    });
  };

  const resetEditCardForm = (): void => {
    setEditCardForm({
      id: null,
      sportId: '',
      type: 'SPORTIDENT',
      cardNumber: '',
      setAsDefault: false,
    });
  };

  const handleCardSubmit = async (): Promise<void> => {
    const sportId = Number(cardForm.sportId);
    const cardNumber = cardForm.cardNumber.trim();

    if (!Number.isFinite(sportId) || sportId <= 0) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t('Pages.Profile.Cards.SportRequired', 'Sport is required'),
        variant: 'error',
      });
      return;
    }

    if (!cardNumber) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t(
          'Pages.Profile.Cards.CardNumberRequired',
          'Card number is required'
        ),
        variant: 'error',
      });
      return;
    }

    try {
      await createUserCard({
        variables: {
          input: {
            sportId,
            type: cardForm.type,
            cardNumber,
            isDefault: cardForm.setAsDefault,
          },
        },
      });

      await refetchCards();
      resetCardForm();

      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t(
          'Pages.Profile.Cards.SaveSuccess',
          'Card settings saved successfully'
        ),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          error instanceof Error
            ? error.message
            : t('Errors.Generic', 'Something went wrong'),
        variant: 'error',
      });
    }
  };

  const handleEditCard = (card: ProfileCard): void => {
    setEditCardForm({
      id: card.id,
      sportId: String(card.sportId),
      type: card.type,
      cardNumber: card.cardNumber,
      setAsDefault: card.isDefault,
    });
    setIsEditCardDialogOpen(true);
  };

  const handleEditCardSubmit = async (): Promise<void> => {
    if (editCardForm.id === null) {
      return;
    }

    const sportId = Number(editCardForm.sportId);
    const cardNumber = editCardForm.cardNumber.trim();

    if (!Number.isFinite(sportId) || sportId <= 0) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t('Pages.Profile.Cards.SportRequired', 'Sport is required'),
        variant: 'error',
      });
      return;
    }

    if (!cardNumber) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t(
          'Pages.Profile.Cards.CardNumberRequired',
          'Card number is required'
        ),
        variant: 'error',
      });
      return;
    }

    try {
      await updateUserCard({
        variables: {
          input: {
            id: editCardForm.id,
            sportId,
            type: editCardForm.type,
            cardNumber,
          },
        },
      });

      if (editCardForm.setAsDefault) {
        await setDefaultUserCard({
          variables: { id: editCardForm.id },
        });
      }

      await refetchCards();
      setIsEditCardDialogOpen(false);
      resetEditCardForm();

      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t(
          'Pages.Profile.Cards.SaveSuccess',
          'Card settings saved successfully'
        ),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          error instanceof Error
            ? error.message
            : t('Errors.Generic', 'Something went wrong'),
        variant: 'error',
      });
    }
  };

  const handleSetDefaultCard = async (cardId: number): Promise<void> => {
    try {
      await setDefaultUserCard({
        variables: { id: cardId },
      });
      await refetchCards();
    } catch (error) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          error instanceof Error
            ? error.message
            : t('Errors.Generic', 'Something went wrong'),
        variant: 'error',
      });
    }
  };

  const handleDeleteCard = async (cardId: number): Promise<void> => {
    try {
      await deleteUserCard({
        variables: { id: cardId },
      });
      await refetchCards();
    } catch (error) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          error instanceof Error
            ? error.message
            : t('Errors.Generic', 'Something went wrong'),
        variant: 'error',
      });
    }
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
  const isProfileFieldsDisabled = !isEditing || isSaving;

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
              {profile.organisation && (
                <p className="text-muted-foreground">{profile.organisation}</p>
              )}
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
                          disabled={isSaving}
                        >
                          {t('Operations.Cancel', { ns: 'common' })}
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
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
                        disabled={isProfileFieldsDisabled}
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
                        disabled={isProfileFieldsDisabled}
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
                      disabled={isProfileFieldsDisabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="organisation">
                      {t(
                        'Pages.Profile.PersonalInfo.Organization',
                        'Organization / Club'
                      )}
                    </Label>
                    <Input
                      id="organisation"
                      value={profile.organisation}
                      onChange={e =>
                        handleInputChange('organisation', e.target.value)
                      }
                      disabled={isProfileFieldsDisabled}
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
                      maxLength={255}
                      disabled={isProfileFieldsDisabled}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('Pages.Profile.Cards.Title', 'Cards')}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      'Pages.Profile.Cards.Description',
                      'Manage your personal chips for each sport'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
                    <div className="space-y-2">
                      <Label htmlFor="cardSport">
                        {t('Pages.Profile.Cards.Sport', 'Sport')}
                      </Label>
                      <select
                        id="cardSport"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                        value={cardForm.sportId}
                        onChange={e =>
                          setCardForm(prev => ({
                            ...prev,
                            sportId: e.target.value,
                          }))
                        }
                        disabled={isCardMutationInProgress || sports.length === 0}
                      >
                        {sports.map(sport => (
                          <option key={sport.id} value={sport.id}>
                            {sport.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cardType">
                        {t('Pages.Profile.Cards.Type', 'Type')}
                      </Label>
                      <select
                        id="cardType"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                        value={cardForm.type}
                        onChange={e =>
                          setCardForm(prev => ({
                            ...prev,
                            type: e.target.value as UserCardType,
                          }))
                        }
                        disabled={isCardMutationInProgress}
                      >
                        <option value="SPORTIDENT">SportIdent</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cardNumber">
                        {t('Pages.Profile.Cards.Number', 'Card number')}
                      </Label>
                      <Input
                        id="cardNumber"
                        value={cardForm.cardNumber}
                        onChange={e =>
                          setCardForm(prev => ({
                            ...prev,
                            cardNumber: e.target.value,
                          }))
                        }
                        maxLength={64}
                        disabled={isCardMutationInProgress}
                      />
                    </div>

                    <div className="flex items-end gap-2">
                      <Button
                        onClick={handleCardSubmit}
                        disabled={
                          isCardMutationInProgress ||
                          sports.length === 0 ||
                          !cardForm.cardNumber.trim()
                        }
                      >
                        {t('Operations.Create', { ns: 'common' })}
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="cardSetDefault"
                      type="checkbox"
                      checked={cardForm.setAsDefault}
                      onChange={e =>
                        setCardForm(prev => ({
                          ...prev,
                          setAsDefault: e.target.checked,
                        }))
                      }
                      disabled={isCardMutationInProgress}
                    />
                    <Label htmlFor="cardSetDefault" className="font-normal">
                      {t(
                        'Pages.Profile.Cards.SetAsDefault',
                        'Set as default for this sport'
                      )}
                    </Label>
                  </div>

                  {isCardsLoading ? (
                    <p className="text-sm text-muted-foreground">
                      {t('Loading', { ns: 'common' })}
                    </p>
                  ) : userCards.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t(
                        'Pages.Profile.Cards.Empty',
                        'No cards saved yet. Add your first card.'
                      )}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {userCards.map(card => (
                        <div
                          key={card.id}
                          className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {card.cardNumber}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {card.sport.name} ·{' '}
                              {card.type === 'SPORTIDENT'
                                ? 'SportIdent'
                                : card.type}
                            </p>
                            {card.isDefault && (
                              <p className="text-xs text-primary">
                                {t(
                                  'Pages.Profile.Cards.DefaultBadge',
                                  'Default for this sport'
                                )}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleEditCard(card)}
                              disabled={isCardMutationInProgress}
                              title={t('Operations.Update', { ns: 'common' })}
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">
                                {t('Operations.Update', { ns: 'common' })}
                              </span>
                            </Button>
                            {!card.isDefault && (
                              <Button
                                variant="outline"
                                onClick={() => handleSetDefaultCard(card.id)}
                                disabled={isCardMutationInProgress}
                              >
                                {t(
                                  'Pages.Profile.Cards.MakeDefault',
                                  'Make default'
                                )}
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  disabled={isCardMutationInProgress}
                                  title={t(
                                    'Pages.Profile.Cards.Delete',
                                    'Delete'
                                  )}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">
                                    {t(
                                      'Pages.Profile.Cards.Delete',
                                      'Delete'
                                    )}
                                  </span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {t(
                                      'Pages.Profile.Cards.DeleteTitle',
                                      'Delete card'
                                    )}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t(
                                      'Pages.Profile.Cards.DeleteConfirm',
                                      'Delete this card?'
                                    )}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    {t('Operations.Cancel', { ns: 'common' })}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteCard(card.id)}
                                  >
                                    {t(
                                      'Pages.Profile.Cards.Delete',
                                      'Delete'
                                    )}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Dialog
                    open={isEditCardDialogOpen}
                    onOpenChange={open => {
                      setIsEditCardDialogOpen(open);
                      if (!open) {
                        resetEditCardForm();
                      }
                    }}
                  >
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {t('Pages.Profile.Cards.EditTitle', 'Edit card')}
                        </DialogTitle>
                        <DialogDescription>
                          {t(
                            'Pages.Profile.Cards.EditDescription',
                            'Update card settings for the selected sport'
                          )}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="editCardSport">
                            {t('Pages.Profile.Cards.Sport', 'Sport')}
                          </Label>
                          <select
                            id="editCardSport"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                            value={editCardForm.sportId}
                            onChange={e =>
                              setEditCardForm(prev => ({
                                ...prev,
                                sportId: e.target.value,
                              }))
                            }
                            disabled={
                              isCardMutationInProgress || sports.length === 0
                            }
                          >
                            {sports.map(sport => (
                              <option key={sport.id} value={sport.id}>
                                {sport.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="editCardType">
                            {t('Pages.Profile.Cards.Type', 'Type')}
                          </Label>
                          <select
                            id="editCardType"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                            value={editCardForm.type}
                            onChange={e =>
                              setEditCardForm(prev => ({
                                ...prev,
                                type: e.target.value as UserCardType,
                              }))
                            }
                            disabled={isCardMutationInProgress}
                          >
                            <option value="SPORTIDENT">SportIdent</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="editCardNumber">
                            {t('Pages.Profile.Cards.Number', 'Card number')}
                          </Label>
                          <Input
                            id="editCardNumber"
                            value={editCardForm.cardNumber}
                            onChange={e =>
                              setEditCardForm(prev => ({
                                ...prev,
                                cardNumber: e.target.value,
                              }))
                            }
                            maxLength={64}
                            disabled={isCardMutationInProgress}
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            id="editCardSetDefault"
                            type="checkbox"
                            checked={editCardForm.setAsDefault}
                            onChange={e =>
                              setEditCardForm(prev => ({
                                ...prev,
                                setAsDefault: e.target.checked,
                              }))
                            }
                            disabled={isCardMutationInProgress}
                          />
                          <Label
                            htmlFor="editCardSetDefault"
                            className="font-normal"
                          >
                            {t(
                              'Pages.Profile.Cards.SetAsDefault',
                              'Set as default for this sport'
                            )}
                          </Label>
                        </div>
                      </div>

                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsEditCardDialogOpen(false);
                            resetEditCardForm();
                          }}
                          disabled={isCardMutationInProgress}
                        >
                          {t('Operations.Cancel', { ns: 'common' })}
                        </Button>
                        <Button
                          onClick={handleEditCardSubmit}
                          disabled={
                            isCardMutationInProgress ||
                            !editCardForm.cardNumber.trim() ||
                            !editCardForm.sportId
                          }
                        >
                          {t('Operations.Update', { ns: 'common' })}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardContent>
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
                <form
                  onSubmit={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    passwordChangeForm.handleSubmit();
                  }}
                >
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">
                        {t('Pages.Profile.Security.CurrentPassword')}
                      </Label>
                      <Field
                        form={passwordChangeForm}
                        name="currentPassword"
                        id="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        disabled={isChangingPassword}
                        helperText={t(
                          'Pages.Profile.Security.CurrentPasswordHelper',
                          'Enter your current account password.',
                        )}
                        validate={validateCurrentPassword}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <passwordChangeForm.Field name="newPassword">
                        {field => (
                          <>
                            <Label htmlFor="newPassword">
                              {t('Pages.Profile.Security.NewPassword')}
                            </Label>
                            <Field
                              form={passwordChangeForm}
                              name="newPassword"
                              id="newPassword"
                              type="password"
                              autoComplete="new-password"
                              disabled={isChangingPassword}
                              helperText={t(
                                'Pages.Profile.Security.NewPasswordHelper',
                                'Use at least 8 characters.',
                              )}
                              validate={validateNewPassword}
                              className="w-full"
                            />
                            {field.state.value && (
                              <PasswordStrengthIndicator
                                password={field.state.value}
                              />
                            )}
                          </>
                        )}
                      </passwordChangeForm.Field>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmNewPassword">
                        {t('Pages.Profile.Security.ConfirmNewPassword')}
                      </Label>
                      <Field
                        form={passwordChangeForm}
                        name="confirmNewPassword"
                        id="confirmNewPassword"
                        type="password"
                        autoComplete="new-password"
                        disabled={isChangingPassword}
                        helperText={t(
                          'Pages.Profile.Security.ConfirmNewPasswordHelper',
                          'Repeat the new password to confirm.',
                        )}
                        validate={validateConfirmNewPassword}
                        className="w-full"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isChangingPassword}
                    >
                      {t('Pages.Profile.Security.UpdatePassword')}
                    </Button>
                  </CardContent>
                </form>
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
