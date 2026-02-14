import { container } from '../../services/base/ServiceContainer';
import { MessageService } from '../../services/MessageService';
import { safeHandleRaw } from '../ipc-result';

const svc = () => new MessageService();

export function registerMessageHandlers(): void {
    safeHandleRaw('message:getTemplates', () => {
        return svc().getTemplates();
    });

    safeHandleRaw('message:saveTemplate', (_event, template: Parameters<MessageService['saveTemplate']>[0]) => {
        return svc().saveTemplate(template);
    });

    safeHandleRaw('message:sendSms', (_event, options: Parameters<MessageService['sendSms']>[0]) => {
        return svc().sendSms(options);
    });

    safeHandleRaw('message:sendEmail', async (_event, options: { to: string; subject: string; body: string; recipientId?: number; recipientType?: string; userId: number }) => {
        const service = container.resolve('NotificationService');
        const recipientType = (options.recipientType ?? 'GUARDIAN') as 'STUDENT' | 'STAFF' | 'GUARDIAN';
        return await service.send({
            recipientType,
            recipientId: options.recipientId || 0,
            channel: 'EMAIL',
            to: options.to,
            subject: options.subject,
            message: options.body
        }, options.userId);
    });

    safeHandleRaw('message:getLogs', (_event, limit = 50) => {
        return svc().getLogs(limit);
    });
}
