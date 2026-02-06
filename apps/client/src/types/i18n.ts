// Definujte všechny translation keys které máte
export type CommonTranslationKeys =
  | 'Table.NoData'
  | 'Back'
  | 'Or'
  | 'Settings'
  | 'Error'
  | 'Share'
  | 'Print'
  | 'Copy'
  | 'Public'
  | 'Private'
  | 'And'
  | 'Loading'
  | 'ErrorMessage'
  | 'UploadFail'
  | 'Operations.Submit'
  ;

// Pro různé namespaces
export type AuthTranslationKeys =
  | 'Auth.Login'
  | 'Auth.Logout'
  | 'Auth.Register';

export type AllTranslationKeys = CommonTranslationKeys | AuthTranslationKeys;
