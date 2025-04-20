import React from 'react';
import { useField } from 'formik';

import { InputWithHelper } from '../molecules/InputWithHelper';

export function Field(props) {
  const [field, meta, helpers] = useField(props);

  const error = meta.touched && meta.error ? meta.error : undefined;

  return (
    <InputWithHelper error={error} {...field} helpers={helpers} {...props} />
  );
}
