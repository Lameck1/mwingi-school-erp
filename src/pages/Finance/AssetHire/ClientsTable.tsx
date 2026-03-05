import { type HireClient } from '../../../types/electron-api/HireAPI'

interface ClientsTableProps {
    readonly clients: HireClient[]
}

export function ClientsTable({ clients }: ClientsTableProps) {
    return (
        <table className="min-w-full divide-y divide-border">
            <thead className="bg-secondary">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Organization</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Phone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Email</th>
                </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
                {clients.map((client) => (
                    <tr key={client.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{client.client_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{client.organization || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{client.contact_phone || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{client.contact_email || '-'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}
