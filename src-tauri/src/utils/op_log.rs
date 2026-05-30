use sqlx::PgPool;
use uuid::Uuid;

pub async fn log_operation(
    pool: &PgPool,
    user_type: &str,
    user_id: Option<Uuid>,
    action: &str,
    module: &str,
    detail: &str,
    ip_address: &str,
) {
    let _ = sqlx::query(
        "INSERT INTO operation_logs (user_type, user_id, action, module, detail, ip_address) VALUES ($1,$2,$3,$4,$5,$6)"
    )
    .bind(user_type)
    .bind(user_id)
    .bind(action)
    .bind(module)
    .bind(detail)
    .bind(ip_address)
    .execute(pool)
    .await;
}
