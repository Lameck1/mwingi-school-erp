import { container } from '../../services/base/ServiceContainer';
import { MessageService } from '../../services/MessageService';
import { ROLES, resolveActorId, safeHandleRawWithRole } from '../ipc-result';

const svc = () => new MessageService();

export function registerMessageHandlers(): void {
    safeHandleRawWithRole('message:getTemplates', ROLES.STAFF, () => {
        return svc().getTemplates();
    });

    safeHandleRawWithRole('message:saveTemplate', ROLES.MANAGEMENT, (_event, template: Parameters<MessageService['saveTemplate']>[0]) => {
        return svc().saveTemplate(template);
    });

    safeHandleRawWithRole('message:sendSms', ROLES.STAFF, (_event, options: Parameters<MessageService['sendSms']>[0]) => {
        return svc().sendSms(options);
    });

    safeHandleRawWithRole('message:sendEmail', ROLES.STAFF, async (event, options: { to: string; subject: string; body: string; recipientId?: number; recipientType?: string; userId?: number }) => {
        const actor = resolveActorId(event, options.userId);
        if (!actor.success) {
            return actor;
        }
        const service = container.resolve('NotificationService');
        const recipientType = (options.recipientType ?? 'GUARDIAN') as 'STUDENT' | 'STAFF' | 'GUARDIAN';
        return await service.send({
            recipientType,
            recipientId: options.recipientId || 0,
            channel: 'EMAIL',
            to: options.to,
            subject: options.subject,
            message: options.body
        }, actor.actorId);
    });

    safeHandleRawWithRole('message:getLogs', ROLES.STAFF, (_event, limit = 50) => {
        return svc().getLogs(limit);
    });
}
