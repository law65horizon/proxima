// graphql/mutations.js

import { gql } from '@apollo/client';

export const REGISTER = gql`
  mutation Register($input: UserInput!) {
    register(input: $input) {
      success
      message
      user {
        id
        email
      }
    }
  }
`

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!, $deviceInfo: String) {
    login(email: $email, password: $password, deviceInfo: $deviceInfo) {
      success
      message
      user {
        id
      }
    }
  }
`

export const SEND_VERIFICATION_CODE = gql`
  mutation SendVerificationCode($email: String!) {
    sendVerificationCode(email: $email) {
      success
      message
      previewUrl
    }
  }
`;

export const VERIFY_CODE = gql`
  mutation VerifyCode($input: VerifyCodeInput!) {
    verifyCode(input: $input) {
      accessToken
      refreshToken
      user {
        id
        email
        role
      }
      sessionId
    }
  }
`;

export const LOGOUT = gql`
  mutation Logout($sessionId: String!) {
    logout(sessionId: $sessionId) {
      message
      success
    }
  }
`;

export const UPDATE_PROFILE = gql`
  mutation UpdateProfile($fullName: String, $phone: String) {
    updateProfile(fullName: $fullName, phone: $phone) {
      id
      email
      name
      phone
    }
  }
`;

export const CREATE_CHECKOUT_SESSION = gql`
  mutation CreateCheckoutSession($input: CreateCheckoutSessionInput!) {
    createCheckoutSession(input: $input) {
      clientSecret
    }
  }
`