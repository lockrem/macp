import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  prefix: string;
  appleServicesId?: string;
  appleTeamId?: string;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;
  public readonly identityProvider?: cognito.UserPoolIdentityProviderApple;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    // Create Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${props.prefix}-users`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        fullname: {
          required: false,
          mutable: true,
        },
      },
      customAttributes: {
        appleId: new cognito.StringAttribute({ mutable: true }),
        agentId: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add Apple Sign-In Identity Provider (if configured)
    if (props.appleServicesId && props.appleTeamId) {
      this.identityProvider = new cognito.UserPoolIdentityProviderApple(
        this,
        'AppleProvider',
        {
          userPool: this.userPool,
          clientId: props.appleServicesId,
          teamId: props.appleTeamId,
          // Key ID and private key are stored in Secrets Manager
          // and referenced here
          keyId: cdk.SecretValue.secretsManager('macp/apple-signin', {
            jsonField: 'keyId',
          }).unsafeUnwrap(),
          privateKey: cdk.SecretValue.secretsManager('macp/apple-signin', {
            jsonField: 'privateKey',
          }).unsafeUnwrap(),
          scopes: ['email', 'name'],
          attributeMapping: {
            email: cognito.ProviderAttribute.APPLE_EMAIL,
            fullname: cognito.ProviderAttribute.APPLE_NAME,
          },
        }
      );
    }

    // Create User Pool Domain for hosted UI
    this.userPoolDomain = this.userPool.addDomain('Domain', {
      cognitoDomain: {
        domainPrefix: props.prefix,
      },
    });

    // Create User Pool Client (for iOS app)
    this.userPoolClient = this.userPool.addClient('MobileClient', {
      userPoolClientName: `${props.prefix}-mobile`,
      generateSecret: false, // Mobile apps don't use client secrets
      authFlows: {
        userSrp: true,
        custom: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'macp://callback', // iOS app deep link
          'http://localhost:3000/callback', // Local development
        ],
        logoutUrls: [
          'macp://logout',
          'http://localhost:3000/logout',
        ],
      },
      supportedIdentityProviders: this.identityProvider
        ? [
            cognito.UserPoolClientIdentityProvider.COGNITO,
            cognito.UserPoolClientIdentityProvider.APPLE,
          ]
        : [cognito.UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Create User Pool Client (for backend server)
    const serverClient = this.userPool.addClient('ServerClient', {
      userPoolClientName: `${props.prefix}-server`,
      generateSecret: true,
      authFlows: {
        adminUserPassword: true,
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${props.prefix}-user-pool-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID (Mobile)',
      exportName: `${props.prefix}-user-pool-client-id`,
    });

    new cdk.CfnOutput(this, 'ServerClientId', {
      value: serverClient.userPoolClientId,
      description: 'Cognito User Pool Client ID (Server)',
      exportName: `${props.prefix}-server-client-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: this.userPoolDomain.domainName,
      description: 'Cognito User Pool Domain',
      exportName: `${props.prefix}-user-pool-domain`,
    });

    new cdk.CfnOutput(this, 'CognitoRegion', {
      value: this.region,
      description: 'Cognito Region',
      exportName: `${props.prefix}-cognito-region`,
    });
  }
}
