import { UserInputError, ValidationError } from '../../../errors';

export const validateUserName = (userName) => {
  const userNameRegExp = /^[a-z]([a-z0-9_.-]+)+$/gi;

  if (!userName.match(userNameRegExp)) {
    throw new ValidationError(`userName must match ${userNameRegExp}`);
  }
};

export const validateUserPassword = (password) => {
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{6,30}$/;

  if (!password.match(strongPasswordRegex)) {
    throw new UserInputError(
      'Password must contain at least: ' +
        'One lower case letter, one upper case letter and one number.',
    );
  }
};
