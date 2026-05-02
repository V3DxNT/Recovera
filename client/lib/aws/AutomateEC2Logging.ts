import { 
    EC2Client, 
    DescribeInstancesCommand, 
    AssociateIamInstanceProfileCommand,
    DescribeIamInstanceProfileAssociationsCommand
} from "@aws-sdk/client-ec2";
import { 
    IAMClient, 
    CreateRoleCommand, 
    PutRolePolicyCommand, 
    GetRoleCommand,
    CreateInstanceProfileCommand,
    AddRoleToInstanceProfileCommand,
    GetInstanceProfileCommand,
    AttachRolePolicyCommand
} from "@aws-sdk/client-iam";
import { CloudCredential } from "../../generated/prisma/client";
import { decrypt } from "../encrypt";

export async function automateEC2Logging(
    credential: CloudCredential,
    instanceId: string,
    logGroupName: string,
    region: string,
    accountId: string
) {
    const credentials = {
        accessKeyId: decrypt(credential.accessKeyId),
        secretAccessKey: decrypt(credential.secretAccessKey),
        ...(credential.sessionToken && { sessionToken: decrypt(credential.sessionToken) })
    };

    const ec2 = new EC2Client({ region, credentials });
    const iam = new IAMClient({ region, credentials });

    try {
        console.log(`[Automate] Starting setup for instance ${instanceId}...`);

        // 1. Ensure Instance has correct IAM Role (Prerequisite for manual setup)
        await ensureInstancePermissions(ec2, iam, instanceId, region, accountId);

        console.log(`[Automate] Successfully prepared IAM permissions for ${instanceId}. Manual agent setup required.`);
        return { success: true };
    } catch (error: any) {
        console.error(`[Automate] IAM setup failed for ${instanceId}:`, error);
        throw error;
    }
}

async function ensureInstancePermissions(ec2: EC2Client, iam: IAMClient, instanceId: string, region: string, accountId: string) {
    // Check if instance already has an IAM profile
    const associations = await ec2.send(new DescribeIamInstanceProfileAssociationsCommand({
        Filters: [{ Name: "instance-id", Values: [instanceId] }]
    }));

    if (associations.IamInstanceProfileAssociations && associations.IamInstanceProfileAssociations.length > 0) {
        console.log(`[Automate] Instance ${instanceId} already has an IAM profile. Assuming it has correct permissions or adding them.`);
        // Note: In a production app, we might want to check the specific policies, 
        // but for now, we'll assume the user either has them or we'll skip for safety if already managed.
        return;
    }

    // Create Role and Instance Profile
    const roleName = "Recovera-EC2-Logging-Role";
    const profileName = "Recovera-EC2-Logging-Profile";

    let roleArn = "";
    try {
        const role = await iam.send(new CreateRoleCommand({
            RoleName: roleName,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: { Service: "ec2.amazonaws.com" },
                    Action: "sts:AssumeRole"
                }]
            })
        }));
        roleArn = role.Role!.Arn!;
    } catch (e: any) {
        if (e.name === "EntityAlreadyExistsException") {
            const role = await iam.send(new GetRoleCommand({ RoleName: roleName }));
            roleArn = role.Role!.Arn!;
        } else throw e;
    }

    // Attach necessary policies
    await iam.send(new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
    }));
    await iam.send(new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
    }));

    // Create Instance Profile
    let profileArn = `arn:aws:iam::${accountId}:instance-profile/${profileName}`;
    try {
        const createResult = await iam.send(new CreateInstanceProfileCommand({ InstanceProfileName: profileName }));
        if (createResult.InstanceProfile?.Arn) {
            profileArn = createResult.InstanceProfile.Arn;
        }
    } catch (e: any) {
        if (e.name === "EntityAlreadyExistsException") {
            try {
                const profile = await iam.send(new GetInstanceProfileCommand({ InstanceProfileName: profileName }));
                if (profile.InstanceProfile?.Arn) {
                    profileArn = profile.InstanceProfile.Arn;
                }
            } catch (innerError: any) {
                console.warn(`[Automate] GetInstanceProfile failed (likely permission), falling back to constructed ARN: ${profileArn}`);
            }
        } else throw e;
    }

    // Add Role to Profile
    try {
        await iam.send(new AddRoleToInstanceProfileCommand({
            InstanceProfileName: profileName,
            RoleName: roleName
        }));
    } catch (e: any) {
        if (e.name !== "LimitExceededException") throw e; // Usually means already added
    }

    // Associate Profile with Instance (with retry for propagation)
    let associateAttempts = 0;
    const maxAssociateAttempts = 10;
    while (associateAttempts < maxAssociateAttempts) {
        try {
            await ec2.send(new AssociateIamInstanceProfileCommand({
                InstanceId: instanceId,
                IamInstanceProfile: { Arn: profileArn }
            }));
            break;
        } catch (e: any) {
            associateAttempts++;
            if (e.name === "InvalidParameterValue" && e.message.includes("Invalid IAM Instance Profile")) {
                console.log(`[Automate] Instance profile not yet visible to EC2 (attempt ${associateAttempts}/${maxAssociateAttempts})...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }
            throw e;
        }
    }
}

